import json
from json_repair import repair_json
import anthropic
from models import EntityResult, BooleanQueryResult, ScoringResult
from prompts import PRODUCTION_BOOLEAN_SYSTEM, PRODUCTION_BOOLEAN_USER


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
    entity: EntityResult,
    scoring: ScoringResult,
    scoring_boolean: BooleanQueryResult,
    smart_prompt: str,
    client: anthropic.AsyncAnthropic,
    query: str = "",
    conversation_history: list[dict] | None = None,
) -> BooleanQueryResult:
    intent_context = _build_intent_context(query, conversation_history or [])

    user_content = PRODUCTION_BOOLEAN_USER.format(
        entity_name=entity.entityName,
        entity_type=entity.entityType,
        full_name=entity.fullName,
        aliases=", ".join(entity.aliases) or "none",
        handles=", ".join(entity.handles) or "none",
        noise_types=", ".join(entity.knownNoiseTypes) or "none",
        intent_context=intent_context,
        smart_prompt=smart_prompt,
        scoring_boolean=scoring_boolean.query,
        precision=scoring.precision,
    )

    response = await client.messages.create(
        model="claude-opus-4-6",
        max_tokens=1024,
        system=PRODUCTION_BOOLEAN_SYSTEM,
        messages=[{"role": "user", "content": user_content}],
    )

    raw = response.content[0].text.strip()
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
    raw = raw.strip()

    data = json.loads(repair_json(raw))
    return BooleanQueryResult(**data)
