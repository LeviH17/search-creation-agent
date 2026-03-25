import { useState, useRef, useEffect } from "react";
import type { ChatMessage } from "../types";

interface ChatPanelProps {
  messages: ChatMessage[];
  isLoading: boolean;
  onSend: (text: string) => void;
  onReset: () => void;
  placeholder?: string;
}

function renderMarkdown(text: string) {
  // Split on code blocks first
  const parts = text.split(/(```[\s\S]*?```)/g);
  return parts.map((part, i) => {
    if (part.startsWith("```")) {
      const code = part.replace(/^```[^\n]*\n?/, "").replace(/```$/, "");
      return (
        <pre key={i} className="bg-gray-950 text-green-400 rounded-lg p-2 font-mono text-xs my-2 overflow-x-auto whitespace-pre-wrap break-all">
          {code.trim()}
        </pre>
      );
    }
    // Split on lines and render inline markdown
    return part.split("\n").map((line, j) => {
      const segments = line.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((seg, k) => {
        if (seg.startsWith("**") && seg.endsWith("**")) {
          return <strong key={k}>{seg.slice(2, -2)}</strong>;
        }
        if (seg.startsWith("`") && seg.endsWith("`")) {
          return <code key={k} className="bg-gray-100 text-gray-800 rounded px-1 font-mono text-xs">{seg.slice(1, -1)}</code>;
        }
        return seg;
      });
      return <span key={`${i}-${j}`}>{segments}{j < part.split("\n").length - 1 && <br />}</span>;
    });
  });
}

function MessageBubble({ msg, onSuggestion }: { msg: ChatMessage; onSuggestion: (s: string) => void }) {
  if (msg.role === "user") {
    return (
      <div className="flex justify-end mb-3">
        <div className="bg-blue-900 text-white rounded-2xl rounded-tr-sm px-4 py-2.5 max-w-xs text-sm leading-relaxed">
          {msg.content}
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-2.5 mb-3">
      <div className="w-7 h-7 rounded-full bg-amber-50 border border-amber-100 flex items-center justify-center text-sm shrink-0 mt-0.5">
        ✨
      </div>
      <div className="flex-1">
        <div className="bg-white border border-gray-200 rounded-2xl rounded-tl-sm px-4 py-2.5 text-sm text-gray-700 leading-relaxed max-w-xs">
          {renderMarkdown(msg.content)}
        </div>
        {msg.suggestions && msg.suggestions.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {msg.suggestions.map((s) => (
              <button
                key={s}
                onClick={() => onSuggestion(s)}
                className="text-xs px-3 py-1.5 rounded-full border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors"
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex items-start gap-2.5 mb-3">
      <div className="w-7 h-7 rounded-full bg-amber-50 border border-amber-100 flex items-center justify-center text-sm shrink-0">
        ✨
      </div>
      <div className="bg-white border border-gray-200 rounded-2xl rounded-tl-sm px-4 py-3">
        <div className="flex gap-1 items-center">
          {[0, 150, 300].map((delay) => (
            <div
              key={delay}
              className="w-1.5 h-1.5 bg-gray-400 rounded-full"
              style={{ animation: `bounce 1s ease-in-out ${delay}ms infinite` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export function ChatPanel({ messages, isLoading, onSend, onReset, placeholder = "e.g. Track Apple Inc. sentiment..." }: ChatPanelProps) {
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  const handleSend = () => {
    const text = input.trim();
    if (!text || isLoading) return;
    setInput("");
    onSend(text);
  };

  const handleSuggestion = (s: string) => {
    if (isLoading) return;
    onSend(s);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-gray-700">Chat</span>
        </div>
        {messages.length > 0 && (
          <button onClick={onReset} className="text-xs text-gray-400 hover:text-gray-600 transition-colors">
            New search
          </button>
        )}
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="text-2xl mb-3">✨</div>
            <p className="text-sm text-gray-500 leading-relaxed max-w-[200px]">
              Tell me what you want to track or monitor.
            </p>
          </div>
        )}
        {messages.map((msg) => (
          <MessageBubble key={msg.id} msg={msg} onSuggestion={handleSuggestion} />
        ))}
        {isLoading && messages[messages.length - 1]?.role === "user" && (
          <TypingIndicator />
        )}
      </div>

      {/* Input */}
      <div className="border-t border-gray-100 bg-white px-4 py-3 shrink-0">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            placeholder={placeholder}
            disabled={isLoading}
            className="flex-1 border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 placeholder-gray-300 disabled:opacity-50 bg-gray-50"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isLoading}
            className="bg-blue-900 text-white px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-blue-800 disabled:opacity-40 transition-all"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
