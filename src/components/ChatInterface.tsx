import { useState, useRef, useEffect } from "react";
import { Persona, ChatMessage } from "@/types/persona";
import { Button } from "@/components/ui/button";
import { Send, ArrowLeft, Bot, User, AlertCircle } from "lucide-react";
import { toast } from "sonner";

interface ChatInterfaceProps {
  persona: Persona;
  onBack: () => void;
}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const CHAT_URL = `${SUPABASE_URL}/functions/v1/persona-chat`;
const MAX_MEMORY = 5;

function getInitials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function PersonaAvatar({ persona, size = "sm" }: { persona: Persona; size?: "sm" | "md" | "lg" }) {
  const sizeClasses = {
    sm: "w-8 h-8 text-xs",
    md: "w-9 h-9 text-sm",
    lg: "w-11 h-11 text-sm",
  };

  if (persona.avatar) {
    return (
      <div className={`${sizeClasses[size]} rounded-full overflow-hidden flex-shrink-0 border border-primary/30`}>
        <img src={persona.avatar} alt={persona.name} className="w-full h-full object-cover" />
      </div>
    );
  }
  return (
    <div className={`${sizeClasses[size]} rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center flex-shrink-0 font-bold text-primary`}>
      {getInitials(persona.name)}
    </div>
  );
}

function TypingIndicator({ persona }: { persona: Persona }) {
  return (
    <div className="flex items-end gap-2.5 animate-fade-in-up">
      <PersonaAvatar persona={persona} size="sm" />
      <div className="bg-card border border-border rounded-2xl rounded-bl-sm px-4 py-3">
        <div className="flex gap-1 items-center h-4">
          <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground typing-dot" />
          <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground typing-dot" />
          <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground typing-dot" />
        </div>
      </div>
    </div>
  );
}

export default function ChatInterface({ persona, onBack }: ChatInterfaceProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content: `Hi! I'm ${persona.name}, a ${persona.role}. Ask me anything — I'm here to help with my expertise in ${persona.skills.split(",")[0].trim()} and more.`,
    },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || isLoading) return;

    const userMsg: ChatMessage = { role: "user", content: text };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsLoading(true);

    // Keep last MAX_MEMORY messages for context (exclude the greeting)
    const history = [...messages.slice(1), userMsg].slice(-MAX_MEMORY);

    try {
      const resp = await fetch(CHAT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ messages: history, persona }),
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: "Request failed" }));
        if (resp.status === 429) toast.error(err.error ?? "Rate limit exceeded");
        else if (resp.status === 402) toast.error(err.error ?? "Credits exhausted");
        else toast.error(err.error ?? "Something went wrong");
        setIsLoading(false);
        return;
      }

      if (!resp.body) throw new Error("No response body");

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let assistantText = "";
      let streamDone = false;

      // Insert placeholder assistant message
      setMessages((prev) => [...prev, { role: "assistant", content: "" }]);
      setIsLoading(false);

      while (!streamDone) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let nl: number;
        while ((nl = buffer.indexOf("\n")) !== -1) {
          let line = buffer.slice(0, nl);
          buffer = buffer.slice(nl + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (line.startsWith(":") || !line.trim()) continue;
          if (!line.startsWith("data: ")) continue;

          const json = line.slice(6).trim();
          if (json === "[DONE]") { streamDone = true; break; }

          try {
            const parsed = JSON.parse(json);
            const chunk = parsed.choices?.[0]?.delta?.content as string | undefined;
            if (chunk) {
              assistantText += chunk;
              setMessages((prev) => {
                const updated = [...prev];
                updated[updated.length - 1] = { role: "assistant", content: assistantText };
                return updated;
              });
            }
          } catch {
            buffer = line + "\n" + buffer;
            break;
          }
        }
      }
    } catch (e) {
      console.error(e);
      toast.error("Connection error. Please try again.");
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-card/50 backdrop-blur-sm flex-shrink-0">
        <Button
          variant="ghost"
          size="icon"
          onClick={onBack}
          className="h-8 w-8 text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft size={16} />
        </Button>
        <div className="pulse-ring rounded-full flex-shrink-0">
          <PersonaAvatar persona={persona} size="md" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-sm truncate">{persona.name}</div>
          <div className="text-xs text-muted-foreground truncate">
            {persona.role} · {persona.experience}y exp
          </div>
        </div>
        <div className="flex items-center gap-1 text-xs text-primary">
          <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
          Active
        </div>
      </div>

      {/* Persona tags */}
      <div className="px-4 py-2 flex gap-1.5 flex-wrap border-b border-border/50 bg-card/20 flex-shrink-0">
        {persona.skills.split(",").slice(0, 4).map((s) => (
          <span
            key={s}
            className="px-2 py-0.5 text-xs rounded-full bg-secondary text-secondary-foreground border border-border/60"
          >
            {s.trim()}
          </span>
        ))}
        <span className="px-2 py-0.5 text-xs rounded-full bg-primary/10 text-primary border border-primary/20">
          {persona.communicationStyle}
        </span>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto scrollbar-thin px-4 py-4 space-y-4">
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex items-end gap-2.5 animate-fade-in-up ${
              msg.role === "user" ? "flex-row-reverse" : "flex-row"
            }`}
          >
            {/* Avatar */}
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold ${
                msg.role === "assistant"
                  ? "bg-primary/20 border border-primary/30 text-primary"
                  : "bg-secondary border border-border text-muted-foreground"
              }`}
            >
              {msg.role === "assistant" ? getInitials(persona.name) : <User size={14} />}
            </div>

            {/* Bubble */}
            <div
              className={`max-w-[75%] px-4 py-2.5 text-sm leading-relaxed ${
                msg.role === "user"
                  ? "bg-primary text-primary-foreground rounded-2xl rounded-br-sm"
                  : "bg-card border border-border text-foreground rounded-2xl rounded-bl-sm"
              } ${msg.content === "" ? "min-w-[60px] min-h-[36px]" : ""}`}
            >
              {msg.content || (
                <span className="text-muted-foreground text-xs italic">thinking...</span>
              )}
            </div>
          </div>
        ))}

        {isLoading && <TypingIndicator persona={persona} />}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="px-4 py-3 border-t border-border bg-card/30 backdrop-blur-sm flex-shrink-0">
        <div className="flex gap-2 items-end">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={`Message ${persona.name}...`}
            rows={1}
            disabled={isLoading}
            className="flex-1 resize-none bg-input border border-border rounded-xl px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary transition-colors scrollbar-thin max-h-[100px] disabled:opacity-50"
            style={{ minHeight: "42px" }}
          />
          <Button
            onClick={sendMessage}
            disabled={!input.trim() || isLoading}
            size="icon"
            className="h-10 w-10 bg-primary text-primary-foreground hover:opacity-90 rounded-xl flex-shrink-0 disabled:opacity-30"
          >
            <Send size={16} />
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mt-1.5 text-center">
          ↵ Send · Shift+↵ New line · Last 5 messages kept in context
        </p>
      </div>
    </div>
  );
}
