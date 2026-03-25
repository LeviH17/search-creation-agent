from __future__ import annotations
from typing import Literal, Optional
from pydantic import BaseModel


class EntityResult(BaseModel):
    entityName: str
    fullName: str
    entityType: Literal["Company", "Person", "Product", "Theme", "Event", "Risk Signal"]
    ticker: Optional[str] = None
    handles: list[str] = []
    aliases: list[str] = []
    businessUnits: list[str] = []
    industryVertical: str
    ambiguityScore: float  # 0.0 – 1.0
    ambiguityLabel: Literal["Very Low", "Low", "Medium", "High", "Very High"]
    ambiguityReasons: list[str] = []
    knownNoiseTypes: list[str] = []


class BooleanQueryResult(BaseModel):
    query: str
    explanation: str
    must_terms: list[str] = []
    should_terms: list[str] = []
    must_not_terms: list[str] = []


class Snippet(BaseModel):
    id: str
    source: Literal["twitter", "reddit", "linkedin", "news", "instagram", "forum"]
    author: str
    handle: str
    text: str
    published_at: str
    url: str
    relevance_score: Optional[float] = None
    relevance_label: Optional[Literal["Relevant", "Somewhat Relevant", "Irrelevant"]] = None
    relevance_reason: Optional[str] = None


class ScoringResult(BaseModel):
    snippets: list[Snippet]
    precision: float
    threshold: float = 0.80
    passed: bool
    iteration: int


class SmartPromptResult(BaseModel):
    prompt: str
    rationale: str


class CreateSearchResult(BaseModel):
    search_id: str
    label: str
    query_used: str
    smart_prompt_used: Optional[str] = None
    precision_achieved: float
    iterations_used: int
    created_at: str


class PipelineRequest(BaseModel):
    query: str
    conversation_history: list[dict] = []
    entity_override: Optional[dict] = None
    boolean_override: Optional[dict] = None
    confirmed_scoring: Optional[dict] = None


class ChatInterpretRequest(BaseModel):
    message: str
    status: str
    pending_boolean: Optional[BooleanQueryResult] = None
    original_query: str = ""
