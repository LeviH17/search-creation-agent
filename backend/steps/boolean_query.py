import json
from json_repair import repair_json
import anthropic
from models import EntityResult, BooleanQueryResult
from prompts import BOOLEAN_QUERY_SYSTEM, BOOLEAN_QUERY_USER


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
    query: str,
    conversation_history: list[dict],
    client: anthropic.AsyncAnthropic,
) -> BooleanQueryResult:
    entity_json = entity.model_dump_json(indent=2)
    intent_context = _build_intent_context(query, conversation_history)

    user_content = BOOLEAN_QUERY_USER.format(
        entity_json=entity_json,
        query=query,
        intent_context=intent_context,
    )

    response = await client.messages.create(
        model="claude-opus-4-6",
        max_tokens=1024,
        system=BOOLEAN_QUERY_SYSTEM,
        messages=[{"role": "user", "content": user_content}]
    )

    raw = response.content[0].text.strip()
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
    raw = raw.strip()

    data = json.loads(repair_json(raw))
    return BooleanQueryResult(**data)
