import json
from json_repair import repair_json
import anthropic
from models import BooleanQueryResult, EntityResult, ScoringResult, SmartPromptResult
from prompts import SMART_PROMPT_SYSTEM, SMART_PROMPT_USER


def _build_intent_context(query: str, conversation_history: list[dict]) -> str:
    lines = []
    for msg in conversation_history:
        role = msg.get("role", "user")
        content = msg.get("content", "").strip()
        if content:
            lines.append(f"{role}: {content}")
    lines.append(f"user: {query}")
    return "\n".join(lines) if lines else "No additional context provided."


async def run(
    boolean: BooleanQueryResult,
    entity: EntityResult,
    scoring: ScoringResult,
    client: anthropic.AsyncAnthropic,
    query: str = "",
    conversation_history: list[dict] | None = None,
) -> SmartPromptResult:
    intent_context = _build_intent_context(query, conversation_history or [])

    # Extract top examples for few-shot prompting
    relevant = sorted(
        [s for s in scoring.snippets if s.relevance_label == "Relevant"],
        key=lambda s: s.relevance_score or 0,
        reverse=True,
    )[:5]
    irrelevant = sorted(
        [s for s in scoring.snippets if s.relevance_label == "Irrelevant"],
        key=lambda s: s.relevance_score or 1,
    )[:5]

    relevant_examples = "\n".join(
        f'{i + 1}. "{s.text}" — {s.relevance_reason or "Clearly on-topic"}'
        for i, s in enumerate(relevant)
    ) or "None available"

    irrelevant_examples = "\n".join(
        f'{i + 1}. "{s.text}" — {s.relevance_reason or "Off-topic"}'
        for i, s in enumerate(irrelevant)
    ) or "None available"

    user_content = SMART_PROMPT_USER.format(
        entity_name=entity.entityName,
        entity_type=entity.entityType,
        full_name=entity.fullName,
        noise_types=", ".join(entity.knownNoiseTypes) or "None identified",
        ambiguity_reasons=", ".join(entity.ambiguityReasons) or "None identified",
        intent_context=intent_context,
        relevant_examples=relevant_examples,
        irrelevant_examples=irrelevant_examples,
        query=boolean.query,
        precision=scoring.precision,
    )

    response = await client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=1024,
        system=SMART_PROMPT_SYSTEM,
        messages=[{"role": "user", "content": user_content}]
    )

    raw = response.content[0].text.strip()
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
    raw = raw.strip()

    data = json.loads(repair_json(raw))
    return SmartPromptResult(**data)
