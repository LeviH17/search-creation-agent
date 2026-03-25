import { usePipeline } from "./hooks/usePipeline";
import { ChatPanel } from "./components/ChatPanel";
import { PipelinePanel } from "./components/PipelinePanel";

export default function App() {
  const { pipeline, messages, isLoading, sendMessage, reset } = usePipeline();

  const chatPlaceholder =
    pipeline.status === "awaiting_boolean"
      ? "Say 'looks good' or describe changes..."
      : pipeline.status === "done" || pipeline.status === "error"
      ? "Ask to modify or start a new search..."
      : "e.g. Track Apple Inc. sentiment...";

  return (
    <div className="flex h-screen bg-gray-50 font-sans overflow-hidden">
      {/* Left: Chat */}
      <div className="w-80 shrink-0 bg-white border-r border-gray-200 flex flex-col">
        <ChatPanel
          messages={messages}
          isLoading={isLoading}
          onSend={sendMessage}
          onReset={reset}
          placeholder={chatPlaceholder}
        />
      </div>

      {/* Right: Pipeline */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <div className="h-12 bg-white border-b border-gray-200 flex items-center px-5 shrink-0 gap-3">
          <span className="text-sm font-semibold text-gray-800">Smart Search Agent</span>
          <span className="text-xs text-gray-300">·</span>
          <span className="text-xs text-gray-400">Real-time pipeline execution</span>
        </div>

        <PipelinePanel pipeline={pipeline} />
      </div>
    </div>
  );
}
