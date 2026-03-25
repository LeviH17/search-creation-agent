import { useState, useRef, useCallback } from "react";
import type {
  PipelineState,
  PipelineStatus,
  StepState,
  ChatMessage,
  StepResultData,
  EntityResult,
  BooleanQueryResult,
} from "../types";

function makeId() {
  return Math.random().toString(36).slice(2);
}

const INITIAL_PIPELINE: PipelineState = {
  status: "idle",
  steps: [],
  pipelineDone: null,
};

export function usePipeline() {
  const [pipeline, setPipeline] = useState<PipelineState>(INITIAL_PIPELINE);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const historyRef = useRef<{ role: string; content: string }[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const pendingEntityRef = useRef<EntityResult | null>(null);
  const pendingBooleanRef = useRef<BooleanQueryResult | null>(null);
  const lastEntityRef = useRef<EntityResult | null>(null);
  const lastBooleanRef = useRef<BooleanQueryResult | null>(null);
  const originalQueryRef = useRef<string>("");
  const pipelineStatusRef = useRef<PipelineStatus>("idle");

  const addMessage = useCallback((role: ChatMessage["role"], content: string, suggestions?: string[]) => {
    const msg: ChatMessage = { id: makeId(), role, content, suggestions, timestamp: Date.now() };
    setMessages((prev) => [...prev, msg]);
    return msg;
  }, []);

  const upsertStep = useCallback((
    stepId: string,
    iteration: number,
    update: Partial<StepState>
  ) => {
    setPipeline((prev) => {
      const key = `${stepId}__${iteration}`;
      const existing = prev.steps.find((s) => s.stepId === key);
      if (existing) {
        return {
          ...prev,
          steps: prev.steps.map((s) => s.stepId === key ? { ...s, ...update } : s),
        };
      }
      const newStep: StepState = {
        stepId: key,
        label: update.label ?? stepId,
        description: update.description ?? "",
        status: "pending",
        result: null,
        errorMessage: null,
        iteration,
        startedAt: null,
        completedAt: null,
        ...update,
      };
      return { ...prev, steps: [...prev.steps, newStep] };
    });
  }, []);

  const processSSELine = useCallback((eventType: string, dataStr: string) => {
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(dataStr);
    } catch {
      return;
    }

    const stepId = data.step_id as string;
    const iteration = (data.iteration as number) ?? 0;
    const payload = data.payload as Record<string, unknown>;

    switch (eventType) {
      case "step_start": {
        upsertStep(stepId, iteration, {
          label: payload.label as string,
          description: payload.description as string,
          status: "running",
          startedAt: Date.now(),
        });
        setPipeline((prev) => ({ ...prev, status: "running" as PipelineStatus }));
        pipelineStatusRef.current = "running";
        break;
      }

      case "step_complete": {
        const resultType = payload.result_type as StepResultData["resultType"];
        const resultData = payload.data;
        upsertStep(stepId, iteration, {
          status: "done",
          completedAt: Date.now(),
          result: { resultType, data: resultData } as StepResultData,
        });
        // Track last known entity and boolean for later modifications
        if (resultType === "entity") lastEntityRef.current = resultData as EntityResult;
        if (resultType === "boolean") lastBooleanRef.current = resultData as BooleanQueryResult;
        break;
      }

      case "step_error": {
        upsertStep(stepId, iteration, {
          status: "failed",
          completedAt: Date.now(),
          errorMessage: (payload.message as string) ?? "Unknown error",
        });
        setIsLoading(false);
        break;
      }

      case "clarification_needed": {
        const question = payload.message as string;
        const suggestions = (payload.suggestions as string[]) ?? [];
        addMessage("assistant", question, suggestions);
        setPipeline((prev) => ({ ...prev, status: "clarifying" as PipelineStatus }));
        pipelineStatusRef.current = "clarifying";
        setIsLoading(false);
        break;
      }

      case "boolean_confirm_needed": {
        const entity = payload.entity as EntityResult;
        const boolean = payload.boolean as BooleanQueryResult;

        pendingEntityRef.current = entity;
        pendingBooleanRef.current = boolean;
        lastEntityRef.current = entity;
        lastBooleanRef.current = boolean;

        // Build a readable chat message showing the boolean query
        const must = boolean.must_terms.length ? boolean.must_terms.map((t) => `\`${t}\``).join(", ") : "—";
        const should = boolean.should_terms.length ? boolean.should_terms.map((t) => `\`${t}\``).join(", ") : "—";
        const mustNot = boolean.must_not_terms.length ? boolean.must_not_terms.map((t) => `\`${t}\``).join(", ") : "—";

        const chatMsg =
          `I've built a boolean query for your search:\n\n` +
          `\`\`\`\n${boolean.query}\n\`\`\`\n\n` +
          `${boolean.explanation}\n\n` +
          `**Must include:** ${must}\n` +
          `**Should include:** ${should}\n` +
          `**Must not include:** ${mustNot}\n\n` +
          `Does this look right? Reply "looks good" to continue, or tell me what to change — e.g. "add Tesla to should terms" or "remove apple pie from must not".`;

        addMessage("assistant", chatMsg);
        setPipeline((prev) => ({ ...prev, status: "awaiting_boolean" as PipelineStatus }));
        pipelineStatusRef.current = "awaiting_boolean";
        setIsLoading(false);
        break;
      }

      case "pipeline_done": {
        const success = payload.success as boolean;
        const iterations_used = payload.iterations_used as number;
        const final_precision = payload.final_precision as number;
        const newStatus = (success ? "done" : "error") as PipelineStatus;
        setPipeline((prev) => ({
          ...prev,
          status: newStatus,
          pipelineDone: { success, iterations_used, final_precision },
        }));
        pipelineStatusRef.current = newStatus;
        if (success) {
          addMessage(
            "assistant",
            `Search created! Achieved ${Math.round(final_precision * 100)}% precision in ${iterations_used} iteration${iterations_used !== 1 ? "s" : ""}. You can ask me to adjust the query, or start a new search.`
          );
        }
        setIsLoading(false);
        break;
      }
    }
  }, [upsertStep, addMessage]);

  const _fireRequest = useCallback(async (body: string) => {
    abortRef.current?.abort();
    abortRef.current = new AbortController();

    let buffer = "";
    let currentEvent = "message";

    try {
      const apiBase = import.meta.env.VITE_API_URL ?? "";
      const response = await fetch(`${apiBase}/api/run-pipeline`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        signal: abortRef.current.signal,
      });

      const reader = response.body!.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (line.startsWith("event: ")) {
            currentEvent = line.slice(7).trim();
          } else if (line.startsWith("data: ")) {
            processSSELine(currentEvent, line.slice(6));
            currentEvent = "message";
          }
        }
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name !== "AbortError") {
        setIsLoading(false);
        setPipeline((prev) => ({ ...prev, status: "error" }));
        pipelineStatusRef.current = "error";
      }
    }
  }, [processSSELine]);

  const runPipeline = useCallback(async (userMessage: string) => {
    historyRef.current = [
      ...historyRef.current,
      { role: "user", content: userMessage },
    ];
    originalQueryRef.current = userMessage;

    addMessage("user", userMessage);
    setIsLoading(true);
    setPipeline((prev) => ({
      ...prev,
      status: "running",
      steps: prev.status === "idle" ? [] : prev.steps,
      pipelineDone: null,
    }));
    pipelineStatusRef.current = "running";

    await _fireRequest(JSON.stringify({
      query: userMessage,
      conversation_history: historyRef.current.slice(0, -1),
    }));
  }, [addMessage, _fireRequest]);

  const _resumeWithBoolean = useCallback(async (entity: EntityResult | null, boolean: BooleanQueryResult) => {
    setPipeline((prev) => ({ ...prev, status: "running" }));
    pipelineStatusRef.current = "running";
    await _fireRequest(JSON.stringify({
      query: originalQueryRef.current,
      conversation_history: historyRef.current,
      entity_override: entity,
      boolean_override: boolean,
    }));
  }, [_fireRequest]);

  const interpretAndAct = useCallback(async (text: string) => {
    addMessage("user", text);
    setIsLoading(true);

    try {
      const apiBase = import.meta.env.VITE_API_URL ?? "";
      const response = await fetch(`${apiBase}/api/interpret-chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          status: pipelineStatusRef.current,
          pending_boolean: pendingBooleanRef.current ?? lastBooleanRef.current,
          original_query: originalQueryRef.current,
        }),
      });

      const result = await response.json();
      addMessage("assistant", result.response_message);

      switch (result.action) {
        case "confirm": {
          const entity = pendingEntityRef.current ?? lastEntityRef.current;
          const boolean = pendingBooleanRef.current ?? lastBooleanRef.current;
          if (entity && boolean) {
            await _resumeWithBoolean(entity, boolean);
          } else {
            setIsLoading(false);
          }
          break;
        }
        case "modify_boolean": {
          if (result.modified_boolean) {
            const entity = pendingEntityRef.current ?? lastEntityRef.current;
            pendingBooleanRef.current = result.modified_boolean;
            lastBooleanRef.current = result.modified_boolean;
            await _resumeWithBoolean(entity, result.modified_boolean);
          } else {
            setIsLoading(false);
          }
          break;
        }
        case "restart": {
          // Reset pipeline state but keep messages so user sees the farewell message
          abortRef.current?.abort();
          historyRef.current = [];
          pendingEntityRef.current = null;
          pendingBooleanRef.current = null;
          lastEntityRef.current = null;
          lastBooleanRef.current = null;
          originalQueryRef.current = "";
          setPipeline(INITIAL_PIPELINE);
          pipelineStatusRef.current = "idle";
          setIsLoading(false);
          break;
        }
        case "answer":
        default: {
          setIsLoading(false);
          break;
        }
      }
    } catch {
      setIsLoading(false);
    }
  }, [addMessage, _resumeWithBoolean]);

  const sendMessage = useCallback((text: string) => {
    const status = pipelineStatusRef.current;
    if (status === "awaiting_boolean" || status === "done" || status === "error") {
      interpretAndAct(text);
    } else {
      runPipeline(text);
    }
  }, [interpretAndAct, runPipeline]);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    historyRef.current = [];
    pendingEntityRef.current = null;
    pendingBooleanRef.current = null;
    lastEntityRef.current = null;
    lastBooleanRef.current = null;
    originalQueryRef.current = "";
    setPipeline(INITIAL_PIPELINE);
    pipelineStatusRef.current = "idle";
    setMessages([]);
    setIsLoading(false);
  }, []);

  const applyBooleanEdit = useCallback(async (updated: BooleanQueryResult) => {
    const entity = pendingEntityRef.current ?? lastEntityRef.current;
    pendingBooleanRef.current = updated;
    lastBooleanRef.current = updated;
    addMessage("assistant", "Got it — applying your changes and re-running the pipeline...");
    setIsLoading(true);
    await _resumeWithBoolean(entity, updated);
  }, [addMessage, _resumeWithBoolean]);

  return { pipeline, messages, isLoading, sendMessage, applyBooleanEdit, reset };
}
