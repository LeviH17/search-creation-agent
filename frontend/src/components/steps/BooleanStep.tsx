import { useState } from "react";
import type { BooleanQueryResult } from "../../types";

interface Props {
  data: BooleanQueryResult;
  onApply?: (updated: BooleanQueryResult) => void;
}

type TermCategory = "must" | "should" | "mustNot";

function reconstructQuery(must: string[], should: string[], mustNot: string[]): string {
  const parts: string[] = [];
  if (must.length) parts.push(`(${must.join(" OR ")})`);
  if (should.length) parts.push(`(${should.join(" OR ")})`);
  if (mustNot.length) parts.push(`NOT (${mustNot.join(" OR ")})`);
  return parts.join(" AND ");
}

function PencilIcon() {
  return (
    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536M9 13l6.768-6.768a2 2 0 012.828 2.828L11.828 15.828a2 2 0 01-1.414.586H8v-2.414A2 2 0 018.586 12.6z" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

export function BooleanStep({ data, onApply }: Props) {
  const [mustTerms, setMustTerms] = useState(data.must_terms);
  const [shouldTerms, setShouldTerms] = useState(data.should_terms);
  const [mustNotTerms, setMustNotTerms] = useState(data.must_not_terms);
  const [editing, setEditing] = useState<{ cat: TermCategory; idx: number; value: string } | null>(null);

  const hasChanges =
    JSON.stringify(mustTerms) !== JSON.stringify(data.must_terms) ||
    JSON.stringify(shouldTerms) !== JSON.stringify(data.should_terms) ||
    JSON.stringify(mustNotTerms) !== JSON.stringify(data.must_not_terms);

  const getSet = (cat: TermCategory): [string[], (t: string[]) => void] => {
    if (cat === "must") return [mustTerms, setMustTerms];
    if (cat === "should") return [shouldTerms, setShouldTerms];
    return [mustNotTerms, setMustNotTerms];
  };

  const deleteTerm = (cat: TermCategory, idx: number) => {
    const [terms, set] = getSet(cat);
    set(terms.filter((_, i) => i !== idx));
  };

  const startEdit = (cat: TermCategory, idx: number) => {
    const [terms] = getSet(cat);
    setEditing({ cat, idx, value: terms[idx] });
  };

  const commitEdit = () => {
    if (!editing) return;
    const { cat, idx, value } = editing;
    const [terms, set] = getSet(cat);
    const updated = [...terms];
    if (value.trim()) {
      updated[idx] = value.trim();
    } else {
      updated.splice(idx, 1);
    }
    set(updated);
    setEditing(null);
  };

  const handleApply = () => {
    if (!onApply) return;
    onApply({
      query: reconstructQuery(mustTerms, shouldTerms, mustNotTerms),
      explanation: data.explanation,
      must_terms: mustTerms,
      should_terms: shouldTerms,
      must_not_terms: mustNotTerms,
    });
  };

  const displayQuery = hasChanges
    ? reconstructQuery(mustTerms, shouldTerms, mustNotTerms)
    : data.query;

  const renderTerms = (cat: TermCategory, bg: string, text: string, border: string) => {
    const [terms] = getSet(cat);
    if (!terms.length) return null;

    const label = cat === "must" ? "MUST include" : cat === "should" ? "SHOULD include" : "MUST NOT include";

    return (
      <div>
        <div className="text-xs font-medium text-gray-500 mb-1">{label}</div>
        <div className="space-y-1">
          {terms.map((t, i) => {
            const isEditing = editing?.cat === cat && editing?.idx === i;
            if (isEditing) {
              return (
                <input
                  key={i}
                  autoFocus
                  value={editing.value}
                  onChange={(e) => setEditing({ ...editing, value: e.target.value })}
                  onBlur={commitEdit}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitEdit();
                    if (e.key === "Escape") setEditing(null);
                  }}
                  className={`w-full text-xs px-2 py-0.5 rounded border border-blue-400 font-mono focus:outline-none focus:ring-1 focus:ring-blue-400 ${bg} ${text}`}
                />
              );
            }
            return (
              <div
                key={i}
                className={`group flex items-center gap-1 text-xs px-2 py-0.5 rounded border font-mono ${bg} ${text} ${border}`}
              >
                <span className="flex-1 truncate min-w-0">{t}</span>
                {onApply && (
                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    <button
                      onClick={() => startEdit(cat, i)}
                      className="p-0.5 rounded hover:bg-black/10 text-current transition-colors"
                      title="Edit term"
                    >
                      <PencilIcon />
                    </button>
                    <button
                      onClick={() => deleteTerm(cat, i)}
                      className="p-0.5 rounded hover:bg-red-100 hover:text-red-600 text-current transition-colors"
                      title="Remove term"
                    >
                      <XIcon />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-3">
      {/* Query */}
      <div>
        <div className="text-xs text-gray-400 uppercase tracking-wide mb-1.5">OpenSearch Boolean Query</div>
        <div className="bg-gray-950 rounded-lg p-3 font-mono text-xs text-green-400 leading-relaxed overflow-x-auto whitespace-pre-wrap break-all">
          {displayQuery}
        </div>
      </div>

      {/* Explanation */}
      <p className="text-xs text-gray-500 italic">{data.explanation}</p>

      {/* Term breakdown */}
      <div className="grid grid-cols-3 gap-2">
        {renderTerms("must", "bg-green-50", "text-green-700", "border-green-100")}
        {renderTerms("should", "bg-blue-50", "text-blue-700", "border-blue-100")}
        {renderTerms("mustNot", "bg-red-50", "text-red-700", "border-red-100")}
      </div>

      {/* Apply changes button */}
      {hasChanges && onApply && (
        <button
          onClick={handleApply}
          className="w-full mt-1 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
        >
          Apply changes →
        </button>
      )}
    </div>
  );
}
