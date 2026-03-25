import type { PipelineState, BooleanQueryResult, ScoringResult } from "../types";
import { StepCard } from "./StepCard";

interface Props {
  pipeline: PipelineState;
  onBooleanApply?: (updated: BooleanQueryResult) => void;
  onScoringConfirm?: (corrected: ScoringResult) => void;
}

export function PipelinePanel({ pipeline, onBooleanApply, onScoringConfirm }: Props) {
  const { steps, status, pipelineDone } = pipeline;

  if (status === "idle") {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center px-8">
        <div className="w-16 h-16 rounded-2xl bg-blue-50 flex items-center justify-center text-3xl mb-4">🔍</div>
        <h2 className="text-lg font-semibold text-gray-800 mb-2">Smart Search Agent</h2>
        <p className="text-sm text-gray-400 max-w-xs leading-relaxed">
          Enter a search query in the chat and the agent will analyze your intent, craft a boolean query, and iteratively improve precision.
        </p>
        <div className="mt-6 space-y-2 text-left w-full max-w-xs">
          {["Track Apple Inc. sentiment", "Monitor Elon Musk mentions", "Follow OpenAI announcements"].map((q) => (
            <div key={q} className="text-xs text-gray-400 px-3 py-2 rounded-lg bg-gray-50 border border-gray-100">
              "{q}"
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-3 shrink-0">
        <span className="text-sm font-semibold text-gray-700">Pipeline</span>
        {status === "running" && (
          <span className="flex items-center gap-1.5 text-xs text-blue-600 bg-blue-50 px-2.5 py-1 rounded-full">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
            Running
          </span>
        )}
        {(status === "awaiting_boolean" || status === "awaiting_scoring_review") && (
          <span className="flex items-center gap-1.5 text-xs text-amber-700 bg-amber-50 px-2.5 py-1 rounded-full">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
            Awaiting your input
          </span>
        )}
        {status === "done" && (
          <span className="text-xs text-green-700 bg-green-50 px-2.5 py-1 rounded-full">
            ✓ Complete · {Math.round((pipelineDone?.final_precision ?? 0) * 100)}% precision
          </span>
        )}
        {status === "error" && pipelineDone && !pipelineDone.success && (
          <span className="text-xs text-red-600 bg-red-50 px-2.5 py-1 rounded-full">
            Max iterations reached · {Math.round(pipelineDone.final_precision * 100)}% precision
          </span>
        )}
      </div>

      {/* Steps */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
        {steps
          .filter((s) => s.result?.resultType !== "intent_check")
          .map((step) => (
            <StepCard
              key={step.stepId}
              step={step}
              onBooleanApply={step.result?.resultType === "boolean" ? onBooleanApply : undefined}
              onScoringConfirm={step.result?.resultType === "scoring" ? onScoringConfirm : undefined}
            />
          ))}
      </div>
    </div>
  );
}
