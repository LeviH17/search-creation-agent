import type { StepState, StepResultData, ScoringResult } from "../types";
import { EntityStep } from "./steps/EntityStep";
import { BooleanStep } from "./steps/BooleanStep";
import { SnippetStep } from "./steps/SnippetStep";
import { ScoringStep } from "./steps/ScoringStep";
import { SmartPromptStep } from "./steps/SmartPromptStep";
import { CreateSearchStep } from "./steps/CreateSearchStep";

function StatusRing({ status }: { status: StepState["status"] }) {
  if (status === "running") {
    return (
      <div className="w-6 h-6 rounded-full border-2 border-blue-500 border-t-transparent animate-spin shrink-0" />
    );
  }
  if (status === "done") {
    return (
      <div className="w-6 h-6 rounded-full bg-green-100 flex items-center justify-center shrink-0">
        <svg className="w-3.5 h-3.5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      </div>
    );
  }
  if (status === "failed") {
    return (
      <div className="w-6 h-6 rounded-full bg-red-100 flex items-center justify-center shrink-0">
        <svg className="w-3.5 h-3.5 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </div>
    );
  }
  return <div className="w-6 h-6 rounded-full border-2 border-gray-200 shrink-0" />;
}

function ElapsedBadge({ startedAt, completedAt }: { startedAt: number | null; completedAt: number | null }) {
  if (!startedAt) return null;
  const ms = (completedAt ?? Date.now()) - startedAt;
  const label = ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
  return <span className="text-xs text-gray-300 ml-auto">{label}</span>;
}

function renderResult(
  result: StepResultData,
  onBooleanApply?: (updated: import("../types").BooleanQueryResult) => void,
  onScoringConfirm?: (corrected: ScoringResult) => void,
) {
  switch (result.resultType) {
    case "intent_check": return null;
    case "entity": return <EntityStep data={result.data} />;
    case "boolean": return <BooleanStep data={result.data} onApply={onBooleanApply} />;
    case "snippets": return <SnippetStep data={result.data} />;
    case "scoring": return <ScoringStep data={result.data} onConfirm={onScoringConfirm} />;
    case "smart_prompt": return <SmartPromptStep data={result.data} />;
    case "create_search": return <CreateSearchStep data={result.data} />;
  }
}

export function StepCard({
  step,
  onBooleanApply,
  onScoringConfirm,
}: {
  step: StepState;
  onBooleanApply?: (updated: import("../types").BooleanQueryResult) => void;
  onScoringConfirm?: (corrected: ScoringResult) => void;
}) {
  const iterLabel = step.iteration > 0 ? ` · Round ${step.iteration + 1}` : "";

  return (
    <div className={`bg-white border rounded-xl overflow-hidden transition-all ${step.status === "running" ? "border-blue-200 shadow-sm shadow-blue-50" : step.status === "done" ? "border-gray-200" : step.status === "failed" ? "border-red-200" : "border-gray-100 opacity-50"}`}>
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-50">
        <StatusRing status={step.status} />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-gray-800 truncate">
            {step.label}{iterLabel}
          </div>
          {step.status === "running" && (
            <div className="text-xs text-gray-400 truncate">{step.description}</div>
          )}
        </div>
        <ElapsedBadge startedAt={step.startedAt} completedAt={step.completedAt} />
      </div>

      {/* Error message */}
      {step.status === "failed" && step.errorMessage && (
        <div className="px-4 py-3 bg-red-50 border-t border-red-100">
          <p className="text-xs text-red-600 font-mono break-all">{step.errorMessage}</p>
        </div>
      )}

      {/* Body */}
      {step.result && step.status === "done" && (
        <div className="px-4 py-4">
          {renderResult(step.result, onBooleanApply, onScoringConfirm)}
        </div>
      )}
    </div>
  );
}
