import json
from json_repair import repair_json
import anthropic
from models import BooleanQueryResult


async def interpret_chat_message(
    user_message: str,
    status: str,
    pending_boolean: BooleanQueryResult | None,
    original_query: str,
) -> dict:
    """
    Use Claude Haiku to interpret the user's chat message and determine what action to take.
    Returns a dict with: action, response_message, modified_boolean (optional)
    """
    client = anthropic.AsyncAnthropic()

    boolean_context = ""
    if pending_boolean:
        must = ", ".join(pending_boolean.must_terms) or "none"
        should = ", ".join(pending_boolean.should_terms) or "none"
        must_not = ", ".join(pending_boolean.must_not_terms) or "none"
        boolean_context = f"""
Current boolean query: {pending_boolean.query}
Must include: {must}
Should include: {should}
Must NOT include: {must_not}
Explanation: {pending_boolean.explanation}
"""

    system = f"""You are an assistant helping a user interact with a search query pipeline.
The user is building a search to monitor: "{original_query}"
Pipeline status: {status}
{boolean_context}
Interpret the user's message and return a JSON object with this exact structure:
{{
  "action": "confirm" | "modify_boolean" | "restart" | "answer",
  "response_message": "friendly response to show the user",
  "modified_boolean": {{
    "query": "full reconstructed query string",
    "explanation": "brief explanation of the query",
    "must_terms": ["term1", "term2"],
    "should_terms": ["term3"],
    "must_not_terms": ["term4"]
  }}
}}

Action rules:
- "confirm": user approves the current state (e.g. "looks good", "continue", "yes", "go ahead", "that's fine", "confirm"). Use this for both boolean confirmation and scoring review confirmation.
- "modify_boolean": user wants to change the boolean query terms. Apply their changes to the current query, keeping all terms they didn't mention. Reconstruct the query string. Include modified_boolean.
- "restart": user wants to start completely over with a new search topic
- "answer": user is asking a question about the pipeline or results — just answer, do not change anything

Only include "modified_boolean" field when action is "modify_boolean".
Respond with valid JSON only."""

    response = await client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=1024,
        system=system,
        messages=[{"role": "user", "content": user_message}],
    )

    raw = response.content[0].text.strip()
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
    raw = raw.strip()

    return json.loads(repair_json(raw))
