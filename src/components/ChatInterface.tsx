import { useState, useRef, useEffect } from "react";
import { Persona, ChatMessage } from "@/types/persona";
import { Button } from "@/components/ui/button";
import { Send, ArrowLeft, User, Mic, MicOff, Volume2, VolumeX } from "lucide-react";
import { toast } from "sonner";

interface ChatInterfaceProps {
  persona: Persona;
  onBack: () => void;
}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const CHAT_URL = `${SUPABASE_URL}/functions/v1/persona-chat`;
const MAX_MEMORY = 5;

type SpeechRecognitionErrorEvent = { error?: string };
type SpeechRecognitionAlternative = { transcript: string };
type SpeechRecognitionResult = {
  isFinal: boolean;
  0: SpeechRecognitionAlternative;
};
type SpeechRecognitionEvent = { resultIndex: number; results: SpeechRecognitionResult[] };
type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onstart: null | (() => void);
  onend: null | (() => void);
  onerror: null | ((event: SpeechRecognitionErrorEvent) => void);
  onresult: null | ((event: SpeechRecognitionEvent) => void);
  start: () => void;
  stop: () => void;
};

declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  }
}

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
  const getGreeting = (): ChatMessage => ({
    role: "assistant",
    content: `Hi! I'm ${persona.name}, a ${persona.role}. Ask me anything — I'm here to help with my expertise in ${persona.skills
      .split(",")[0]
      .trim()} and more.`,
  });

  const chatStorageKey = `personaChatMessages:${persona.id}`;
  const historyLoadedRef = useRef(false);

  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content: getGreeting().content,
    },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [voiceMode, setVoiceMode] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const voiceModeRef = useRef(voiceMode);
  const isLoadingRef = useRef(isLoading);
  const messagesRef = useRef<ChatMessage[]>(messages);

  useEffect(() => {
    voiceModeRef.current = voiceMode;
  }, [voiceMode]);

  useEffect(() => {
    isLoadingRef.current = isLoading;
  }, [isLoading]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    // Load conversation history per persona.
    // This runs when switching personas (persona.id changes).
    if (typeof window === "undefined") return;

    try {
      const raw = window.localStorage.getItem(chatStorageKey);
      if (!raw) {
        historyLoadedRef.current = true;
        setMessages([getGreeting()]);
        return;
      }

      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) throw new Error("Invalid stored chat payload");

      const restored = parsed.filter((m) => m && typeof m === "object" && (m.role === "user" || m.role === "assistant") && typeof m.content === "string") as ChatMessage[];

      historyLoadedRef.current = true;
      setMessages(restored.length ? restored : [getGreeting()]);
    } catch {
      // If localStorage is corrupted, fall back to a fresh greeting.
      historyLoadedRef.current = true;
      setMessages([getGreeting()]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [persona.id]);

  useEffect(() => {
    // Persist conversation only after it fully rendered (not while streaming).
    if (!historyLoadedRef.current) return;
    if (typeof window === "undefined") return;
    if (isLoading) return;

    try {
      window.localStorage.setItem(chatStorageKey, JSON.stringify(messages));
    } catch {
      // Ignore quota/security errors.
    }
  }, [messages, isLoading, chatStorageKey]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  const setIsLoadingSafe = (v: boolean) => {
    isLoadingRef.current = v;
    setIsLoading(v);
  };

  const cancelSpeech = () => {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    setIsSpeaking(false);
  };

  const speakText = (text: string) => {
    if (!voiceModeRef.current) return;
    if (!("speechSynthesis" in window)) {
      toast.error("Text-to-speech is not supported in this browser.");
      return;
    }

    const normalized = text.replace(/\s+/g, " ").trim();
    if (!normalized) return;
    if (normalized.length > 8000) {
      toast.error("Response too long to read aloud fully.");
    }

    cancelSpeech();
    const utterance = new SpeechSynthesisUtterance(normalized.slice(0, 8000));
    utterance.lang = navigator.language || "en-US";
    utterance.rate = 1;
    utterance.pitch = 1;
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);
    setIsSpeaking(true);
    window.speechSynthesis.speak(utterance);
  };

  useEffect(() => {
    // Initialize SpeechRecognition once (if supported).
    const SpeechRecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognitionCtor) return;

    const recognition = new SpeechRecognitionCtor();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = navigator.language || "en-US";

    recognition.onstart = () => setIsListening(true);
    recognition.onend = () => setIsListening(false);
    recognition.onerror = (e: SpeechRecognitionErrorEvent) => {
      setIsListening(false);
      if (voiceModeRef.current) {
        toast.error(e?.error === "not-allowed" ? "Microphone permission denied." : "Voice input error.");
      }
    };

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      // Combine transcript pieces into a single string.
      let finalTranscript = "";
      let interimTranscript = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const chunk = result?.[0]?.transcript ?? "";
        if (result.isFinal) finalTranscript += chunk;
        else interimTranscript += chunk;
      }

      const transcriptToShow = finalTranscript || interimTranscript;
      if (transcriptToShow) setInput(transcriptToShow);

      // When we have a final transcript, optionally auto-send.
      if (finalTranscript && voiceModeRef.current && !isLoadingRef.current) {
        try {
          recognition.stop();
        } catch {
          // Some browsers throw if stop() is called too late.
        }
        sendMessage(finalTranscript);
      }
    };

    recognitionRef.current = recognition;
    return () => {
      try {
        recognition.stop();
      } catch {
        // ignore
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!voiceMode) {
      setIsListening(false);
      cancelSpeech();
      try {
        recognitionRef.current?.stop?.();
      } catch {
        // ignore
      }
    }
  }, [voiceMode]);

  const sendMessage = async (overrideText?: string) => {
    const text = (overrideText ?? input).trim();
    if (!text || isLoadingRef.current) return;

    const userMsg: ChatMessage = { role: "user", content: text };
    setIsLoadingSafe(true);
    setMessages((prev) => [...prev, userMsg]);
    setInput("");

    // Keep last MAX_MEMORY messages for context (exclude the greeting)
    const history = [...messagesRef.current.slice(1), userMsg].slice(-MAX_MEMORY);

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

      setIsLoadingSafe(false);
      if (voiceModeRef.current && assistantText.trim()) {
        speakText(assistantText);
      }
    } catch (e) {
      console.error(e);
      toast.error("Connection error. Please try again.");
      setIsLoadingSafe(false);
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
            {msg.role === "assistant" ? (
              <PersonaAvatar persona={persona} size="sm" />
            ) : (
              <div className="w-8 h-8 rounded-full bg-secondary border border-border flex items-center justify-center flex-shrink-0 text-muted-foreground">
                <User size={14} />
              </div>
            )}

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
            variant="outline"
            size="icon"
            type="button"
            aria-label={voiceMode ? "Disable voice mode" : "Enable voice mode"}
            title={voiceMode ? "Voice mode: on (speaks responses)" : "Voice mode: off"}
            onClick={() => {
              if (!voiceMode) {
                const SpeechRecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition;
                if (!SpeechRecognitionCtor) {
                  toast.error("Speech recognition is not supported in this browser.");
                  return;
                }
                if (!("speechSynthesis" in window)) {
                  toast.error("Text-to-speech is not supported in this browser.");
                  return;
                }
              }
              setVoiceMode((v) => !v);
            }}
            className="h-10 w-10 rounded-xl flex-shrink-0"
          >
            {voiceMode ? <Volume2 size={18} /> : <VolumeX size={18} />}
          </Button>

          <Button
            variant="outline"
            size="icon"
            type="button"
            aria-label={isListening ? "Stop listening" : "Start listening"}
            title={voiceMode ? (isListening ? "Stop voice input" : "Speak to send") : "Enable voice mode first"}
            onClick={() => {
              const recognition = recognitionRef.current;
              if (!voiceMode) return;
              if (!recognition) {
                toast.error("Voice input is not available in this browser.");
                return;
              }
              if (isLoadingRef.current) return;

              try {
                if (isListening) recognition.stop();
                else recognition.start();
              } catch {
                // Some browsers throw if start() is called while already starting.
              }
            }}
            disabled={!voiceMode || isLoading}
            className="h-10 w-10 rounded-xl flex-shrink-0"
          >
            {isListening ? <MicOff size={18} /> : <Mic size={18} />}
          </Button>

          <Button
            onClick={() => sendMessage()}
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
