import { useState, useRef, useEffect } from "react";
import { Persona, ChatMessage } from "@/types/persona";
import { Button } from "@/components/ui/button";
import { Send, ArrowLeft, User, Mic, MicOff, Volume2, VolumeX, Paperclip, X, FileText } from "lucide-react";
import { toast } from "sonner";
import mammoth from "mammoth";

interface ChatInterfaceProps {
  persona: Persona;
  onBack: () => void;
  onSaveToMemory?: (role: "user" | "assistant", content: string, createdAt?: number) => void;
}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const CHAT_URL = `${SUPABASE_URL}/functions/v1/persona-chat`;
const MAX_MEMORY = 5;
const MAX_ATTACHMENT_FILE_SIZE = 1024 * 1024; // 1MB
const MAX_ATTACHMENTS = 5;
const MAX_ATTACHMENT_CHARS_PER_FILE = 12000;

type ChatAttachment = {
  name: string;
  language?: string;
  content: string;
  kind?: "docx" | "text";
  previewHtml?: string;
};

function isValidAttachment(value: unknown): value is ChatAttachment {
  if (!value || typeof value !== "object") return false;
  const item = value as { name?: unknown; language?: unknown; content?: unknown; kind?: unknown; previewHtml?: unknown };
  return (
    typeof item.name === "string" &&
    item.name.length > 0 &&
    typeof item.content === "string" &&
    (typeof item.language === "undefined" || typeof item.language === "string") &&
    (typeof item.kind === "undefined" || item.kind === "docx" || item.kind === "text") &&
    (typeof item.previewHtml === "undefined" || typeof item.previewHtml === "string")
  );
}

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

type ContentSegment =
  | { type: "text"; content: string }
  | { type: "code"; content: string; language?: string };

function parseMessageContent(content: string): ContentSegment[] {
  const segments: ContentSegment[] = [];
  const regex = /```([\w+-]*)\n?([\s\S]*?)```/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      segments.push({
        type: "text",
        content: content.slice(lastIndex, match.index),
      });
    }

    segments.push({
      type: "code",
      language: match[1] || undefined,
      content: match[2].replace(/\n$/, ""),
    });

    lastIndex = regex.lastIndex;
  }

  if (lastIndex < content.length) {
    segments.push({
      type: "text",
      content: content.slice(lastIndex),
    });
  }

  return segments.length ? segments : [{ type: "text", content }];
}

function getLanguageFromFileName(fileName: string) {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    ts: "ts",
    tsx: "tsx",
    js: "js",
    jsx: "jsx",
    py: "python",
    java: "java",
    go: "go",
    rb: "ruby",
    php: "php",
    css: "css",
    scss: "scss",
    html: "html",
    json: "json",
    md: "markdown",
    sql: "sql",
    yml: "yaml",
    yaml: "yaml",
    xml: "xml",
    txt: "text",
    log: "text",
    sh: "bash",
  };
  return map[ext] ?? "text";
}

function getExtension(fileName: string) {
  return fileName.split(".").pop()?.toLowerCase() ?? "";
}

function isLikelyBinaryText(content: string) {
  if (!content) return false;
  const sample = content.slice(0, 2000);
  let controlChars = 0;
  for (let i = 0; i < sample.length; i++) {
    const code = sample.charCodeAt(i);
    const isControl = code < 32 && code !== 9 && code !== 10 && code !== 13;
    if (isControl) controlChars++;
  }
  return controlChars / sample.length > 0.03;
}

async function readAttachmentContent(
  file: File
): Promise<{ content: string; previewHtml?: string; kind: "docx" | "text" }> {
  const ext = getExtension(file.name);
  if (ext === "docx") {
    const arrayBuffer = await file.arrayBuffer();
    const [raw, html] = await Promise.all([
      mammoth.extractRawText({ arrayBuffer }),
      mammoth.convertToHtml({ arrayBuffer }),
    ]);
    return {
      content: raw.value?.trim() ?? "",
      previewHtml: html.value?.trim() ?? "",
      kind: "docx",
    };
  }

  const text = (await file.text()).trim();
  if (isLikelyBinaryText(text)) {
    return { content: "", kind: "text" };
  }
  return { content: text, kind: "text" };
}

function renderInlineCode(text: string, keyPrefix: string) {
  const parts = text.split(/(`[^`]+`)/g);
  return parts.map((part, idx) => {
    const isInlineCode = part.startsWith("`") && part.endsWith("`") && part.length > 1;
    if (!isInlineCode) {
      return <span key={`${keyPrefix}-txt-${idx}`}>{part}</span>;
    }

    return (
      <code
        key={`${keyPrefix}-code-${idx}`}
        className="rounded bg-black/20 px-1.5 py-0.5 text-[12px] font-medium"
      >
        {part.slice(1, -1)}
      </code>
    );
  });
}

function MessageContent({ content, role }: { content: string; role: "user" | "assistant" }) {
  const segments = parseMessageContent(content);

  return (
    <div className="space-y-2">
      {segments.map((segment, idx) => {
        if (segment.type === "code") {
          return (
            <div
              key={`code-${idx}`}
              className={`overflow-x-auto rounded-xl border ${
                role === "user" ? "border-primary-foreground/20 bg-black/25" : "border-border/80 bg-black/30"
              }`}
            >
              {segment.language && (
                <div className="border-b border-white/10 px-3 py-1 text-[11px] uppercase tracking-wide text-muted-foreground">
                  {segment.language}
                </div>
              )}
              <pre className="p-3 text-[12px] leading-relaxed">
                <code className="mono whitespace-pre">{segment.content}</code>
              </pre>
            </div>
          );
        }

        return (
          <p key={`text-${idx}`} className="whitespace-pre-wrap break-words text-sm leading-relaxed">
            {renderInlineCode(segment.content, `segment-${idx}`)}
          </p>
        );
      })}
    </div>
  );
}

function formatMessageTime(timestamp?: number) {
  if (!timestamp) return "";
  try {
    return new Intl.DateTimeFormat(undefined, {
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(timestamp));
  } catch {
    return "";
  }
}

function compact(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

function generateFollowUpSuggestions(userPrompt: string, personaName: string): string[] {
  const prompt = compact(userPrompt);
  const low = prompt.toLowerCase();
  const topic = prompt.replace(/[?.!]+$/, "").slice(0, 70);

  const docReview = /\b(review|sop|file|document|audit|compliance|gap|csv|pharma)\b/i.test(low);
  const strategy = /\b(strategy|trend|market|growth|competitor|plan|roadmap|q[1-4])\b/i.test(low);
  const code = /\b(code|bug|error|refactor|function|class|api|typescript|python|javascript)\b/i.test(low);

  if (docReview) {
    return [
      "What are the top 3 critical gaps?",
      "Can you give a compliance-ready revised section?",
      "What is missing from roles and responsibilities?",
    ];
  }

  if (code) {
    return [
      "Can you show a corrected version?",
      "What are the likely bugs here?",
      "How can I improve performance safely?",
    ];
  }

  if (strategy) {
    return [
      "What should we prioritize first this quarter?",
      "What risks should we monitor closely?",
      "How should we turn this into an action plan?",
    ];
  }

  return [
    `Can you expand on "${topic || "this"}"?`,
    `What should I do next, ${personaName}?`,
    "Can you summarize this into 3 action items?",
  ];
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

export default function ChatInterface({ persona, onBack, onSaveToMemory }: ChatInterfaceProps) {
  const knowledgeSourceLabel =
    persona.knowledgeSource === "provided"
      ? "Provided only"
      : persona.knowledgeSource === "both"
        ? "Provided + Internet"
        : "Internet";
  const allowAttachments = persona.messagingDefaults?.allowAttachments ?? true;
  const showFollowUps = persona.messagingDefaults?.includeFollowUpSuggestions ?? true;

  const getGreeting = (): ChatMessage => ({
    role: "assistant",
    content: `Hi! I'm ${persona.name}, a ${persona.role}. Ask me anything - I'm here to help with my expertise in ${persona.skills
      .split(",")[0]
      .trim()} and more.`,
    createdAt: Date.now(),
  });
  const quickStarters = (persona.conversationStarters ?? []).map((s) => s.trim()).filter(Boolean).slice(0, 3);

  const chatStorageKey = `personaChatMessages:${persona.id}`;
  const historyLoadedRef = useRef(false);

  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content: getGreeting().content,
      createdAt: Date.now(),
    },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [voiceMode, setVoiceMode] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const [previewAttachment, setPreviewAttachment] = useState<ChatAttachment | null>(null);
  const [followUps, setFollowUps] = useState<string[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const attachmentInputRef = useRef<HTMLInputElement>(null);
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

      const restored = parsed
        .filter(
          (m: unknown) =>
            m &&
            typeof m === "object" &&
            ((m as { role?: string }).role === "user" || (m as { role?: string }).role === "assistant") &&
            typeof (m as { content?: unknown }).content === "string"
        )
        .map((m: { role: "user" | "assistant"; content: string; attachments?: unknown[] }) => ({
          role: m.role,
          content: m.content,
          createdAt: typeof (m as { createdAt?: unknown }).createdAt === "number" ? (m as { createdAt: number }).createdAt : Date.now(),
          attachments: Array.isArray(m.attachments) ? m.attachments.filter(isValidAttachment) : undefined,
        })) as ChatMessage[];

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
    setPreviewAttachment(null);
  }, [persona.id]);

  useEffect(() => {
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    if (!lastUser?.content) return;
    setFollowUps(generateFollowUpSuggestions(lastUser.content, persona.name).slice(0, 3));
  }, [messages, persona.name]);

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
    const baseText = (overrideText ?? input).trim();
    const hasAttachments = attachments.length > 0;
    const visibleText = baseText || (hasAttachments ? `Attached ${attachments.length} file(s) for review.` : "");
    if (!visibleText || isLoadingRef.current) return;

    const userMsg: ChatMessage = {
      role: "user",
      content: visibleText,
      attachments: hasAttachments ? attachments : undefined,
      createdAt: Date.now(),
    };
    const requestUserContent = [
      baseText,
      ...attachments.map(
        (file) =>
          `Attachment: ${file.name}\n\`\`\`${file.language ?? "text"}\n${file.content.slice(0, MAX_ATTACHMENT_CHARS_PER_FILE)}\n\`\`\``
      ),
    ]
      .filter(Boolean)
      .join("\n\n");
    const requestUserMsg: ChatMessage = {
      role: "user",
      content: requestUserContent || visibleText,
    };
    setIsLoadingSafe(true);
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setFollowUps([]);
    const requestAttachments = attachments;
    setAttachments([]);

    // Keep last MAX_MEMORY messages for context (exclude the greeting)
    const history = [...messagesRef.current.slice(1), requestUserMsg].slice(-MAX_MEMORY);

    try {
      const resp = await fetch(CHAT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ messages: history, persona, attachments: requestAttachments }),
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
      const assistantCreatedAt = Date.now();

      // Insert placeholder assistant message
      setMessages((prev) => [...prev, { role: "assistant", content: "", createdAt: assistantCreatedAt }]);

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
                const existing = updated[updated.length - 1];
                updated[updated.length - 1] = {
                  role: "assistant",
                  content: assistantText,
                  createdAt: existing?.createdAt ?? assistantCreatedAt,
                };
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

  const handleAttachmentUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;

    if (attachments.length + files.length > MAX_ATTACHMENTS) {
      toast.error(`You can attach up to ${MAX_ATTACHMENTS} files per message.`);
      e.target.value = "";
      return;
    }

    const loaded: ChatAttachment[] = [];

    for (const file of files) {
      if (file.size > MAX_ATTACHMENT_FILE_SIZE) {
        toast.error(`${file.name}: file is too large (max 1MB).`);
        continue;
      }

      try {
        const parsed = await readAttachmentContent(file);
        if (!parsed.content) {
          toast.error(`${file.name}: unreadable or empty file.`);
          continue;
        }
        loaded.push({
          name: file.name,
          language: getLanguageFromFileName(file.name),
          content: parsed.content,
          kind: parsed.kind,
          previewHtml: parsed.previewHtml,
        });
      } catch {
        toast.error(`${file.name}: could not read this file.`);
      }
    }

    if (loaded.length) {
      setAttachments((prev) => [...prev, ...loaded]);
      toast.success(`${loaded.length} file(s) attached.`);
    }

    e.target.value = "";
  };

  return (
    <div className="relative flex h-full min-w-0 overflow-hidden">
      <div className="flex min-w-0 flex-1 flex-col">
      {/* Header */}
      <div className="glass-panel flex items-center gap-1.5 border-b border-border/70 px-3 py-1 sm:gap-2 sm:px-4 flex-shrink-0">
        <Button
          variant="ghost"
          size="icon"
          onClick={onBack}
          className="h-7 w-7 text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft size={14} />
        </Button>
        <div className="pulse-ring rounded-full flex-shrink-0 scale-90">
          <PersonaAvatar persona={persona} size="sm" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-[11px] truncate">{persona.name}</div>
          <div className="text-[10px] text-muted-foreground truncate">
            {persona.role} | {persona.experience}y exp
          </div>
          <div className="mt-0.5 hidden flex-wrap items-center gap-0.5 sm:flex">
            {persona.skills.split(",").slice(0, 3).map((s) => (
              <span
                key={s}
                className="px-1.5 py-0 text-[9px] rounded-full bg-secondary text-secondary-foreground border border-border/60"
              >
                {s.trim()}
              </span>
            ))}
            <span className="px-1.5 py-0 text-[9px] rounded-full bg-primary/10 text-primary border border-primary/20">
              {persona.communicationStyle}
            </span>
            <span className="px-1.5 py-0 text-[9px] rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
              Source: {knowledgeSourceLabel}
            </span>
          </div>
        </div>
        <div className="hidden items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] text-primary sm:flex">
          <div className="w-1 h-1 rounded-full bg-primary animate-pulse" />
          Active
        </div>
      </div>

      {/* Messages */}
      <div className="scrollbar-thin flex-1 space-y-4 overflow-y-auto px-3 py-4 sm:px-4 sm:py-5">
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
              className={`max-w-[95%] px-3 py-2.5 shadow-sm sm:max-w-[78%] sm:px-4 ${
                msg.role === "user"
                  ? "bg-primary text-primary-foreground rounded-2xl rounded-br-sm"
                  : "bg-card/90 border border-border text-foreground rounded-2xl rounded-bl-sm"
              } ${msg.content === "" ? "min-w-[60px] min-h-[36px]" : ""}`}
            >
              <div
                className={`mb-1 text-[11px] ${
                  msg.role === "user" ? "text-primary-foreground/80 text-right" : "text-muted-foreground"
                }`}
              >
                {msg.role === "assistant" ? persona.name : "You"} {formatMessageTime(msg.createdAt)}
              </div>
              {msg.content ? (
                <MessageContent content={msg.content} role={msg.role} />
              ) : (
                <span className="text-muted-foreground text-xs italic">thinking...</span>
              )}
              {msg.attachments && msg.attachments.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {msg.attachments.map((file, fileIndex) => (
                    <button
                      key={`${file.name}-${fileIndex}`}
                      type="button"
                      onClick={() => setPreviewAttachment(file)}
                      className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[11px] transition-colors ${
                        msg.role === "user"
                          ? "border-primary-foreground/30 bg-primary-foreground/10 text-primary-foreground hover:bg-primary-foreground/20"
                          : "border-border bg-secondary/70 text-secondary-foreground hover:bg-secondary"
                      }`}
                      title={`Open ${file.name}`}
                    >
                      <FileText size={11} />
                      {file.name}
                    </button>
                  ))}
                </div>
              )}
              {onSaveToMemory && msg.content && (
                <div className={`mt-2 flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                  <button
                    type="button"
                    onClick={() => onSaveToMemory(msg.role, msg.content, msg.createdAt)}
                    className={`rounded-full border px-2.5 py-1 text-[11px] transition-colors ${
                      msg.role === "user"
                        ? "border-primary-foreground/35 bg-primary-foreground/10 text-primary-foreground hover:bg-primary-foreground/20"
                        : "border-border bg-secondary/70 text-secondary-foreground hover:bg-secondary"
                    }`}
                  >
                    Save to memory
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}

        {isLoading && <TypingIndicator persona={persona} />}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="glass-panel border-t border-border/70 px-3 py-2 sm:px-4 flex-shrink-0">
        {showFollowUps && followUps.length > 0 && !isLoading && (
          <div className="mb-1.5 flex flex-wrap gap-1">
            {followUps.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => setInput(q)}
                className="rounded-full border border-primary/20 bg-primary/10 px-2.5 py-0.5 text-[11px] text-primary transition-colors hover:bg-primary/20"
              >
                {q}
              </button>
            ))}
          </div>
        )}

        {quickStarters.length > 0 && (!showFollowUps || followUps.length === 0) && (
          <div className="mb-1.5 flex flex-wrap gap-1">
            {quickStarters.map((starter) => (
              <button
                key={starter}
                type="button"
                onClick={() => setInput(starter)}
                className="rounded-full border border-border bg-secondary/70 px-2.5 py-0.5 text-[11px] text-secondary-foreground transition-colors hover:border-primary/50 hover:bg-secondary"
              >
                {starter}
              </button>
            ))}
          </div>
        )}

        {allowAttachments && (
          <input
            ref={attachmentInputRef}
            type="file"
            multiple
            className="hidden"
            accept=".txt,.md,.markdown,.json,.csv,.ts,.tsx,.js,.jsx,.py,.java,.go,.rb,.php,.css,.scss,.html,.xml,.yml,.yaml,.log,.sql,.sh"
            onChange={handleAttachmentUpload}
          />
        )}

        {attachments.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {attachments.map((file, index) => (
              <span
                key={`${file.name}-${index}`}
                className="inline-flex items-center gap-1 rounded-full border border-border bg-secondary/70 px-2 py-1 text-[11px] text-secondary-foreground"
              >
                <Paperclip size={11} />
                {file.name}
                <button
                  type="button"
                  onClick={() => setAttachments((prev) => prev.filter((_, i) => i !== index))}
                  className="text-muted-foreground hover:text-foreground"
                  aria-label={`Remove ${file.name}`}
                >
                  <X size={11} />
                </button>
              </span>
            ))}
          </div>
        )}

        <div className="flex flex-wrap items-end gap-1.5">
          {allowAttachments && (
            <Button
              variant="outline"
              size="icon"
              type="button"
              aria-label="Attach files"
              title="Attach file for review"
              onClick={() => attachmentInputRef.current?.click()}
              disabled={isLoading}
              className="h-9 w-9 flex-shrink-0 rounded-lg"
            >
              <Paperclip size={15} />
            </Button>
          )}

          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={`Message ${persona.name}...`}
            rows={1}
            disabled={isLoading}
            className="order-1 w-full max-h-[90px] resize-none rounded-lg border border-border bg-input px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground transition-colors focus:border-primary focus:outline-none disabled:opacity-50 sm:order-none sm:flex-1"
            style={{ minHeight: "36px" }}
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
            className="hidden h-9 w-9 flex-shrink-0 rounded-lg sm:inline-flex"
          >
            {voiceMode ? <Volume2 size={16} /> : <VolumeX size={16} />}
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
            className="hidden h-9 w-9 flex-shrink-0 rounded-lg sm:inline-flex"
          >
            {isListening ? <MicOff size={16} /> : <Mic size={16} />}
          </Button>

          <Button
            onClick={() => sendMessage()}
            disabled={(!input.trim() && attachments.length === 0) || isLoading}
            size="icon"
            className="h-9 w-9 flex-shrink-0 rounded-lg bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-30"
          >
            <Send size={15} />
          </Button>
        </div>
      </div>
    </div>

      {previewAttachment && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-30 bg-black/50 lg:hidden"
            onClick={() => setPreviewAttachment(null)}
            aria-label="Close file preview"
          />
          <aside className="fixed inset-y-0 right-0 z-40 w-full border-l border-border bg-background/95 backdrop-blur-sm sm:w-[420px] lg:static lg:z-10 lg:w-[380px]">
            <div className="flex h-full flex-col">
              <div className="flex items-center justify-between border-b border-border px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{previewAttachment.name}</p>
                  <p className="text-xs text-muted-foreground">{previewAttachment.language ?? "text"}</p>
                </div>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8"
                  onClick={() => setPreviewAttachment(null)}
                >
                  <X size={14} />
                </Button>
              </div>
              <div className="flex-1 overflow-auto p-4">
                {previewAttachment.kind === "docx" && previewAttachment.previewHtml ? (
                  <iframe
                    title={`Preview ${previewAttachment.name}`}
                    sandbox=""
                    className="h-full min-h-[420px] w-full rounded-xl border border-border bg-card"
                    srcDoc={`<!doctype html><html><head><meta charset="utf-8"/><style>body{font-family: 'Plus Jakarta Sans', Arial, sans-serif; color:#e5e7eb; background:#0c1220; margin:0; padding:20px; line-height:1.6;} p{margin:0 0 12px;} h1,h2,h3,h4{margin:16px 0 10px; line-height:1.3;} ul,ol{padding-left:20px;} table{border-collapse:collapse; width:100%; margin:12px 0;} td,th{border:1px solid #2b3448; padding:6px 8px; text-align:left;}</style></head><body>${previewAttachment.previewHtml}</body></html>`}
                  />
                ) : (
                  <pre className="mono whitespace-pre-wrap break-words rounded-xl border border-border bg-card/70 p-3 text-xs leading-relaxed">
                    {previewAttachment.content}
                  </pre>
                )}
              </div>
            </div>
          </aside>
        </>
      )}
    </div>
  );
}
