import json
import asyncio
from datetime import datetime, timezone
from typing import Callable, Awaitable
import anthropic

from models import PipelineRequest, BooleanQueryResult, ScoringResult
from steps import (
    clarification,
    entity_extraction,
    boolean_query,
    snippet_fetch,
    relevance_scoring,
    boolean_broadening,
    smart_prompt as smart_prompt_step,
    production_boolean as production_boolean_step,
    create_search,
)

MAX_ITERATIONS = 3


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


async def run_pipeline(
    request: PipelineRequest,
    emit: Callable[[str, str, dict, int], Awaitable[None]]
) -> None:
    """
    Main pipeline orchestrator.
    emit(event_type, step_id, payload, iteration)
    """
    client = anthropic.AsyncAnthropic(max_retries=5)

    # ── Phase 2: boolean override provided — skip setup steps ─────────────────
    if request.entity_override and request.boolean_override:
        from models import EntityResult, BooleanQueryResult as BQR
        entity = EntityResult(**request.entity_override)
        boolean = BQR(**request.boolean_override)

    else:
        # ── Step 0: Clarification check ──────────────────────────────────────
        await emit("step_start", "intent_check", {
            "label": "Checking intent clarity",
            "description": "Evaluating whether the query has enough context to build a targeted search."
        }, 0)

        try:
            needs_clarification, question, suggestions = await clarification.check(request, client)
        except Exception as e:
            await emit("step_error", "intent_check", {"message": str(e), "recoverable": False}, 0)
            return

        if needs_clarification:
            await emit("step_complete", "intent_check", {
                "result_type": "intent_check",
                "data": {"sufficient": False}
            }, 0)
            await emit("clarification_needed", "intent_check", {
                "message": question,
                "suggestions": suggestions
            }, 0)
            return

        await emit("step_complete", "intent_check", {
            "result_type": "intent_check",
            "data": {"sufficient": True}
        }, 0)

        # ── Step 1: Entity extraction ─────────────────────────────────────────
        await emit("step_start", "entity_extraction", {
            "label": "Analyzing intent & extracting entities",
            "description": "Identifying the entity, its aliases, ambiguity signals, and known noise types."
        }, 0)

        try:
            entity = await entity_extraction.run(request, client)
        except Exception as e:
            await emit("step_error", "entity_extraction", {"message": str(e), "recoverable": False}, 0)
            return

        await emit("step_complete", "entity_extraction", {
            "result_type": "entity",
            "data": entity.model_dump()
        }, 0)

        # ── Step 2: Boolean query ─────────────────────────────────────────────
        await emit("step_start", "boolean_query", {
            "label": "Crafting boolean query",
            "description": "Building an OpenSearch boolean query from entity signals and aliases."
        }, 0)

        try:
            boolean = await boolean_query.run(entity, request.query, client)
        except Exception as e:
            await emit("step_error", "boolean_query", {"message": str(e), "recoverable": False}, 0)
            return

        await emit("step_complete", "boolean_query", {
            "result_type": "boolean",
            "data": boolean.model_dump()
        }, 0)

        # ── Pause: ask frontend to confirm/edit the boolean ───────────────────
        await emit("boolean_confirm_needed", "boolean_query", {
            "entity": entity.model_dump(),
            "boolean": boolean.model_dump(),
        }, 0)
        return

    # ── Step 3: Fetch snippets ────────────────────────────────────────────────
    await emit("step_start", "snippet_fetch", {
        "label": "Fetching sample snippets",
        "description": "Generating a realistic sample of matching results based on your entity."
    }, 0)

    try:
        snippets = await snippet_fetch.run(boolean, entity, client)
    except Exception as e:
        await emit("step_error", "snippet_fetch", {"message": str(e), "recoverable": False}, 0)
        return

    await emit("step_complete", "snippet_fetch", {
        "result_type": "snippets",
        "data": [s.model_dump() for s in snippets]
    }, 0)

    # ── Iteration loop ────────────────────────────────────────────────────────
    current_boolean: BooleanQueryResult = boolean
    current_snippets = snippets
    current_smart_prompt = None
    last_scoring: ScoringResult | None = None

    for iteration in range(MAX_ITERATIONS):

        # Step 4: Score snippets
        await emit("step_start", "relevance_scoring", {
            "label": "Scoring snippet relevance",
            "description": f"Evaluating each result against search intent (target: ≥80% precision). Iteration {iteration + 1}."
        }, iteration)

        try:
            scoring = await relevance_scoring.run(
                current_snippets, entity, request.query, iteration, client
            )
        except Exception as e:
            await emit("step_error", "relevance_scoring", {"message": str(e), "recoverable": False}, iteration)
            return

        last_scoring = scoring
        await emit("step_complete", "relevance_scoring", {
            "result_type": "scoring",
            "data": {
                **scoring.model_dump(exclude={"snippets"}),
                "snippets": [s.model_dump() for s in scoring.snippets]
            }
        }, iteration)

        if scoring.passed:
            # ── Smart prompt (if not yet generated) ──────────────────────
            # Always generate a smart prompt before the production boolean
            # so the broader boolean can rely on it for semantic filtering.
            if not current_smart_prompt:
                await emit("step_start", "smart_prompt", {
                    "label": "Crafting Smart Search filter",
                    "description": "Writing a natural language AI filter to catch semantic noise the boolean can't handle."
                }, iteration)

                try:
                    smart_result = await smart_prompt_step.run(current_boolean, entity, scoring, client)
                except Exception as e:
                    await emit("step_error", "smart_prompt", {"message": str(e), "recoverable": False}, iteration)
                    return

                current_smart_prompt = smart_result.prompt

                await emit("step_complete", "smart_prompt", {
                    "result_type": "smart_prompt",
                    "data": smart_result.model_dump()
                }, iteration)

            # ── Production boolean ────────────────────────────────────────
            # Generate a broader boolean for production use — the smart prompt
            # handles semantic filtering, so the boolean can maximise recall.
            prod_boolean = current_boolean  # fallback
            if current_smart_prompt:
                await emit("step_start", "production_boolean", {
                    "label": "Crafting production boolean",
                    "description": "Building a broader boolean for live use — semantic filtering is handled by the Smart Search prompt."
                }, iteration)

                try:
                    prod_boolean = await production_boolean_step.run(
                        entity, scoring, current_boolean, current_smart_prompt, client
                    )
                except Exception as e:
                    await emit("step_error", "production_boolean", {"message": str(e), "recoverable": False}, iteration)
                    return

                await emit("step_complete", "production_boolean", {
                    "result_type": "boolean",
                    "data": prod_boolean.model_dump()
                }, iteration)

            # ── Create search ─────────────────────────────────────────────
            await emit("step_start", "create_search", {
                "label": "Creating search",
                "description": "Precision threshold met. Saving the search configuration."
            }, iteration)

            result = create_search.run(prod_boolean, scoring, iteration, current_smart_prompt)

            await emit("step_complete", "create_search", {
                "result_type": "create_search",
                "data": result.model_dump()
            }, iteration)

            await emit("pipeline_done", "pipeline", {
                "success": True,
                "iterations_used": iteration,
                "final_precision": scoring.precision
            }, iteration)
            return

        # ── Step 5: Broaden boolean ───────────────────────────────────────
        await emit("step_start", "boolean_broadening", {
            "label": "Broadening boolean query",
            "description": f"Precision was {scoring.precision:.0%} — refining query to reduce noise and improve recall."
        }, iteration)

        try:
            current_boolean = await boolean_broadening.run(
                current_boolean, scoring, entity, iteration, client
            )
        except Exception as e:
            await emit("step_error", "boolean_broadening", {"message": str(e), "recoverable": False}, iteration)
            return

        await emit("step_complete", "boolean_broadening", {
            "result_type": "boolean",
            "data": current_boolean.model_dump()
        }, iteration)

        # ── Step 6: Smart search prompt ───────────────────────────────────
        await emit("step_start", "smart_prompt", {
            "label": "Crafting Smart Search filter",
            "description": "Writing a natural language AI filter to catch semantic noise the boolean can't handle."
        }, iteration)

        try:
            smart_result = await smart_prompt_step.run(current_boolean, entity, scoring, client)
        except Exception as e:
            await emit("step_error", "smart_prompt", {"message": str(e), "recoverable": False}, iteration)
            return

        current_smart_prompt = smart_result.prompt

        await emit("step_complete", "smart_prompt", {
            "result_type": "smart_prompt",
            "data": smart_result.model_dump()
        }, iteration)

        # ── Step 7: Filtered snippet fetch ────────────────────────────────
        await emit("step_start", "filtered_snippet_fetch", {
            "label": "Fetching filtered results",
            "description": "Re-fetching with Smart Search filter applied."
        }, iteration)

        try:
            current_snippets = await snippet_fetch.run_filtered(
                current_boolean, entity, current_smart_prompt, client
            )
        except Exception as e:
            await emit("step_error", "filtered_snippet_fetch", {"message": str(e), "recoverable": False}, iteration)
            return

        await emit("step_complete", "filtered_snippet_fetch", {
            "result_type": "snippets",
            "data": [s.model_dump() for s in current_snippets]
        }, iteration)

    # Exhausted all iterations
    final_precision = last_scoring.precision if last_scoring else 0.0
    await emit("pipeline_done", "pipeline", {
        "success": False,
        "iterations_used": MAX_ITERATIONS,
        "final_precision": final_precision
    }, MAX_ITERATIONS)
