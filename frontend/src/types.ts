// ── Backend model mirrors ────────────────────────────────────────────────────

export interface EntityResult {
  entityName: string;
  fullName: string;
  entityType: "Company" | "Person" | "Product" | "Theme" | "Event" | "Risk Signal";
  ticker: string | null;
  handles: string[];
  aliases: string[];
  businessUnits: string[];
  industryVertical: string;
  ambiguityScore: number;
  ambiguityLabel: "Very Low" | "Low" | "Medium" | "High" | "Very High";
  ambiguityReasons: string[];
  knownNoiseTypes: string[];
}

export interface BooleanQueryResult {
  query: string;
  explanation: string;
  must_terms: string[];
  should_terms: string[];
  must_not_terms: string[];
}

export interface Snippet {
  id: string;
  source: "twitter" | "reddit" | "linkedin" | "news" | "instagram" | "forum";
  author: string;
  handle: string;
  text: string;
  published_at: string;
  url: string;
  relevance_score: number | null;
  relevance_label: "Relevant" | "Somewhat Relevant" | "Irrelevant" | null;
  relevance_reason: string | null;
}

export interface ScoringResult {
  snippets: Snippet[];
  precision: number;
  threshold: number;
  passed: boolean;
  iteration: number;
}

export interface SmartPromptResult {
  prompt: string;
  rationale: string;
}

export interface CreateSearchResult {
  search_id: string;
  label: string;
  query_used: string;
  smart_prompt_used: string | null;
  precision_achieved: number;
  iterations_used: number;
  created_at: string;
}

// ── SSE Event types ──────────────────────────────────────────────────────────

export type ResultType =
  | "intent_check"
  | "entity"
  | "boolean"
  | "snippets"
  | "scoring"
  | "smart_prompt"
  | "create_search";

export type StepResultData =
  | { resultType: "intent_check"; data: { sufficient: boolean } }
  | { resultType: "entity"; data: EntityResult }
  | { resultType: "boolean"; data: BooleanQueryResult }
  | { resultType: "snippets"; data: Snippet[] }
  | { resultType: "scoring"; data: ScoringResult }
  | { resultType: "smart_prompt"; data: SmartPromptResult }
  | { resultType: "create_search"; data: CreateSearchResult };

// ── Frontend pipeline state ──────────────────────────────────────────────────

export type StepStatus = "pending" | "running" | "done" | "failed";

export interface StepState {
  stepId: string;
  label: string;
  description: string;
  status: StepStatus;
  result: StepResultData | null;
  errorMessage: string | null;
  iteration: number;
  startedAt: number | null;
  completedAt: number | null;
}

export type PipelineStatus = "idle" | "clarifying" | "running" | "awaiting_boolean" | "awaiting_scoring_review" | "done" | "error";

export interface PipelineState {
  status: PipelineStatus;
  steps: StepState[];
  pipelineDone: { success: boolean; iterations_used: number; final_precision: number } | null;
}

// ── Chat ─────────────────────────────────────────────────────────────────────

export type MessageRole = "user" | "assistant";

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  suggestions?: string[];
  timestamp: number;
}

export interface PipelineRequest {
  query: string;
  conversation_history: { role: string; content: string }[];
  entity_override?: EntityResult;
  boolean_override?: BooleanQueryResult;
  confirmed_scoring?: ScoringResult;
}
