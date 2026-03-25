import { useState, useMemo } from "react";
import type { ScoringResult, Snippet } from "../../types";

type Label = "Relevant" | "Somewhat Relevant" | "Irrelevant";

const LABEL_CYCLE: Label[] = ["Relevant", "Somewhat Relevant", "Irrelevant"];

function nextLabel(current: Label | null): Label {
  const idx = current ? LABEL_CYCLE.indexOf(current) : -1;
  return LABEL_CYCLE[(idx + 1) % LABEL_CYCLE.length];
}

function labelBadgeClass(label: Label | null): string {
  switch (label) {
    case "Relevant":
      return "bg-green-100 text-green-800 hover:bg-green-200";
    case "Somewhat Relevant":
      return "bg-amber-100 text-amber-800 hover:bg-amber-200";
    case "Irrelevant":
      return "bg-red-100 text-red-800 hover:bg-red-200";
    default:
      return "bg-gray-100 text-gray-600 hover:bg-gray-200";
  }
}

function sourceBadgeClass(source: Snippet["source"]): string {
  switch (source) {
    case "twitter":
      return "bg-blue-100 text-blue-700";
    case "reddit":
      return "bg-orange-100 text-orange-700";
    case "linkedin":
      return "bg-blue-600 text-white";
    case "news":
      return "bg-gray-100 text-gray-700";
    case "instagram":
      return "bg-pink-100 text-pink-700";
    case "forum":
      return "bg-purple-100 text-purple-700";
    default:
      return "bg-gray-100 text-gray-600";
  }
}

function sortSnippets(snippets: Snippet[]): Snippet[] {
  const order: Record<string, number> = { Irrelevant: 0, "Somewhat Relevant": 1, Relevant: 2 };
  return [...snippets].sort((a, b) => {
    const aOrder = order[a.relevance_label ?? "Relevant"] ?? 2;
    const bOrder = order[b.relevance_label ?? "Relevant"] ?? 2;
    return aOrder - bOrder;
  });
}

function calcPrecision(snippets: Snippet[]): number {
  if (snippets.length === 0) return 0;
  const passing = snippets.filter(
    (s) => s.relevance_label === "Relevant" || s.relevance_label === "Somewhat Relevant"
  ).length;
  return passing / snippets.length;
}

interface Props {
  data: ScoringResult;
  onConfirm?: (corrected: ScoringResult) => void;
}

export function ScoringStep({ data, onConfirm }: Props) {
  const [overrides, setOverrides] = useState<Record<string, Label>>({});

  const snippetsWithOverrides: Snippet[] = useMemo(
    () =>
      data.snippets.map((s) =>
        overrides[s.id] !== undefined
          ? { ...s, relevance_label: overrides[s.id] }
          : s
      ),
    [data.snippets, overrides]
  );

  const precision = useMemo(() => calcPrecision(snippetsWithOverrides), [snippetsWithOverrides]);
  const thresholdPct = Math.round(data.threshold * 100);
  const pct = Math.round(precision * 100);
  const passed = precision >= data.threshold;

  const relevant = snippetsWithOverrides.filter((s) => s.relevance_label === "Relevant").length;
  const somewhat = snippetsWithOverrides.filter((s) => s.relevance_label === "Somewhat Relevant").length;
  const irrelevant = snippetsWithOverrides.filter((s) => s.relevance_label === "Irrelevant").length;
  const correctedCount = Object.keys(overrides).length;

  const sorted = useMemo(() => sortSnippets(snippetsWithOverrides), [snippetsWithOverrides]);

  function handleLabelClick(id: string, currentLabel: Label | null) {
    const next = nextLabel(currentLabel);
    setOverrides((prev) => ({ ...prev, [id]: next }));
  }

  function handleConfirm() {
    if (!onConfirm) return;
    const corrected: ScoringResult = {
      snippets: snippetsWithOverrides,
      precision,
      threshold: data.threshold,
      passed,
      iteration: data.iteration,
    };
    onConfirm(corrected);
  }

  return (
    <div className="space-y-4">
      {/* Pass/fail badge */}
      <div className="flex items-center gap-3">
        <div
          className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-semibold ${
            passed ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
          }`}
        >
          <span>{passed ? "✓" : "✗"}</span>
          <span>{passed ? "Threshold met" : "Below threshold"}</span>
        </div>
        <span className="text-sm text-gray-500">
          <span className="font-bold text-gray-800">{pct}%</span> precision · target {thresholdPct}%
        </span>
      </div>

      {/* Precision bar with threshold marker */}
      <div>
        <div className="relative w-full h-3 bg-gray-100 rounded-full overflow-visible">
          <div
            className={`h-full rounded-full transition-all ${passed ? "bg-green-500" : "bg-red-400"}`}
            style={{ width: `${pct}%` }}
          />
          <div
            className="absolute top-0 h-full flex flex-col items-center"
            style={{ left: `${thresholdPct}%`, transform: "translateX(-50%)" }}
          >
            <div className="w-0.5 h-full bg-gray-500 opacity-60" />
          </div>
        </div>
        <div className="relative mt-1" style={{ paddingLeft: `${thresholdPct}%` }}>
          <span
            className="text-xs text-gray-400"
            style={{ transform: "translateX(-50%)", display: "inline-block" }}
          >
            {thresholdPct}% target
          </span>
        </div>
      </div>

      {/* Breakdown */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-green-50 rounded-lg p-2.5 text-center">
          <div className="text-xl font-bold text-green-700">{relevant}</div>
          <div className="text-xs text-green-600">Relevant</div>
        </div>
        <div className="bg-amber-50 rounded-lg p-2.5 text-center">
          <div className="text-xl font-bold text-amber-700">{somewhat}</div>
          <div className="text-xs text-amber-600">Somewhat Relevant</div>
        </div>
        <div className="bg-red-50 rounded-lg p-2.5 text-center">
          <div className="text-xl font-bold text-red-700">{irrelevant}</div>
          <div className="text-xs text-red-600">Irrelevant</div>
        </div>
      </div>

      {!passed && (
        <p className="text-xs text-gray-500 italic">
          Precision is below the 80% threshold — broadening the query and applying a Smart Search filter.
        </p>
      )}

      {/* Snippet list (shown when onConfirm is provided — i.e. in review mode) */}
      {onConfirm && (
        <>
          <div className="border-t border-gray-100 pt-3">
            <p className="text-xs text-gray-500 mb-2">
              Click a label to correct it. Labels are sorted: Irrelevant first, then Somewhat Relevant, then Relevant.
            </p>
            <div className="max-h-80 overflow-y-auto space-y-2 pr-1">
              {sorted.map((snippet) => {
                const label = snippet.relevance_label;
                const isEdited = overrides[snippet.id] !== undefined;
                return (
                  <div
                    key={snippet.id}
                    className="border border-gray-100 rounded-lg p-2.5 bg-gray-50 space-y-1.5"
                  >
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className={`text-xs font-medium px-2 py-0.5 rounded-full ${sourceBadgeClass(
                          snippet.source
                        )}`}
                      >
                        {snippet.source}
                      </span>
                      <span className="text-xs text-gray-500 truncate max-w-[120px]">
                        {snippet.author}
                      </span>
                      <button
                        onClick={() => handleLabelClick(snippet.id, label)}
                        className={`ml-auto flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full cursor-pointer transition-colors ${labelBadgeClass(
                          label
                        )}`}
                        title="Click to cycle label"
                      >
                        {label ?? "Unscored"}
                        {isEdited && (
                          <span className="text-[10px] opacity-60 ml-0.5">edited</span>
                        )}
                      </button>
                    </div>
                    <p className="text-xs text-gray-700 leading-relaxed line-clamp-2">
                      {snippet.text.length > 120
                        ? snippet.text.slice(0, 120) + "…"
                        : snippet.text}
                    </p>
                    {snippet.relevance_reason && (
                      <p className="text-xs text-gray-400 italic">{snippet.relevance_reason}</p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Confirm button */}
          <button
            onClick={handleConfirm}
            className="w-full mt-2 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2.5 rounded-lg transition-colors"
          >
            <span>
              Confirm scoring
              {correctedCount > 0 ? ` · ${correctedCount} corrected` : ""}
            </span>
            <span>→</span>
          </button>
        </>
      )}
    </div>
  );
}
