import { useEffect, useRef, useState } from "react";
import { Persona } from "@/types/persona";
import PersonaForm from "@/components/PersonaForm";
import ChatInterface from "@/components/ChatInterface";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Bot, ChevronLeft, ChevronRight, Clock, Copy, Database, Globe, Hash, Home, MessageCircle, Moon, Pencil, Pin, PinOff, Plus, Settings2, Shield, Star, Sun, Trash2, Upload, UserRound, Zap } from "lucide-react";
import { Toaster, toast } from "sonner";
import mammoth from "mammoth";

type View = "home" | "create" | "edit" | "chat";
type StudioPanel = "message-ai" | "persona-settings" | "memory-upload" | "memory-stack" | "advanced";
type MessageFeedFilter = "all" | "dms" | "channels";

type MessageFeedItem = {
  id: string;
  type: "dm" | "channel";
  name: string;
  personaId?: string;
  lastMessage: string;
  lastAt: number;
  unread: number;
  pinned: boolean;
  favorite: boolean;
};

const MAX_MEMORY_UPLOAD_FILE_SIZE = 1024 * 1024;
const MAX_MEMORY_KNOWLEDGE_CHARS = 30000;
const STYLE_OPTIONS = ["formal", "casual", "mentor-like", "direct", "analytical"];
const TRAIT_SUGGESTIONS = ["analytical", "friendly", "strict", "creative", "empathetic", "leadership", "problem-solver", "detail-oriented"];
const DEFAULT_MESSAGING_DEFAULTS: NonNullable<Persona["messagingDefaults"]> = {
  responseLength: "brief",
  includeFollowUpSuggestions: true,
  citationStyle: "none",
  allowAttachments: true,
  reviewStrictness: "balanced",
};
const DEFAULT_GOVERNANCE: NonNullable<Persona["governance"]> = {
  visibility: "private",
  allowSharing: false,
  allowPersonaDMs: true,
  rolePermissions: {
    ownerAdmin: true,
    manager: true,
    member: true,
    viewer: false,
  },
  complianceProfile: "none",
  retentionDays: 365,
  auditLogging: true,
  piiGuard: true,
};
const CHANNEL_SEEDS = [
  { id: "channel-ops", name: "Operations Channel", lastMessage: "Weekly planning updates", unread: 0 },
  { id: "channel-quality", name: "Quality Review", lastMessage: "SOP review check-in", unread: 1 },
  { id: "channel-leadership", name: "Leadership Room", lastMessage: "Quarterly priorities", unread: 0 },
];

const DEFAULT_DUMMY_PERSONA: Persona = {
  id: "default-dummy-persona",
  name: "Demo Assistant",
  role: "General AI Assistant",
  experience: "5",
  skills: "Communication, Analysis, Documentation, Research",
  traits: "friendly, analytical, practical",
  communicationStyle: "direct",
  background: "A ready-to-use default persona so you can start immediately.",
  knowledgeSource: "internet",
  internetDataAccess: true,
  providedKnowledge: "",
  providedLinks: "",
  conversationStarters: [
    "Review this file and tell me what is missing",
    "Summarize key points from uploaded memory",
    "Give action items in bullet points",
  ],
  memoryFiles: [],
  importantChatMemories: [],
  messagingDefaults: DEFAULT_MESSAGING_DEFAULTS,
  governance: DEFAULT_GOVERNANCE,
  createdAt: Date.now(),
};

function getInitials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function WorkspaceShell({
  persona,
  activePanel,
  onBack,
  onSelectPanel,
  onSelectMessageAI,
  lightMode,
  onToggleTheme,
  transparentTopbar = false,
  children,
}: {
  persona: Persona | null;
  activePanel: StudioPanel;
  onBack: () => void;
  onSelectPanel?: (p: StudioPanel) => void;
  onSelectMessageAI?: () => void;
  lightMode: boolean;
  onToggleTheme: () => void;
  transparentTopbar?: boolean;
  children: React.ReactNode;
}) {
  const current = persona ?? DEFAULT_DUMMY_PERSONA;
  const [isStudioSidebarMinimized, setIsStudioSidebarMinimized] = useState(false);
  const navClass = (panel: StudioPanel) =>
    `whitespace-nowrap rounded-lg px-3 py-2 text-left text-sm transition-colors ${
      activePanel === panel ? "bg-primary/15 text-primary" : "text-foreground/85 hover:bg-secondary/45"
    }`;

  return (
    <div className="h-[100dvh] overflow-hidden bg-background">
      {!transparentTopbar && (
        <header className="border-b border-white/10 bg-[hsl(var(--workspace-top))] text-white">
          <div className="flex h-14 w-full items-center gap-3 px-3 sm:px-4">
            <div className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/20 bg-white/10">
              <Bot size={15} />
            </div>
            <p className="text-sm font-semibold">Persona Workspace</p>
          </div>
        </header>
      )}

      <div className={`flex ${transparentTopbar ? "h-[100dvh]" : "h-[calc(100dvh-56px)]"} overflow-hidden`}>
        <aside className="hidden w-[74px] border-r border-white/10 bg-[hsl(var(--workspace-rail))] px-2 py-3 text-white/85 lg:block">
          <button
            type="button"
            onClick={onBack}
            className="mb-2 flex w-full flex-col items-center justify-center gap-1 rounded-xl bg-white/10 py-2 text-[10px] font-medium leading-tight tracking-wide transition-colors hover:bg-white/15"
          >
            <Home size={14} />
            <span>My AI</span>
          </button>
          <button
            type="button"
            onClick={() => {
              onSelectPanel?.("message-ai");
              onSelectMessageAI?.();
            }}
            className={`flex w-full flex-col items-center justify-center gap-1 rounded-xl py-2 text-[10px] font-medium leading-tight tracking-wide transition-colors ${
              activePanel === "message-ai"
                ? "bg-primary/15 text-primary"
                : "text-white/75 hover:bg-white/10 hover:text-white"
            }`}
          >
            <MessageCircle size={14} />
            <span>Messages</span>
          </button>
          <button
            type="button"
            onClick={onToggleTheme}
            className="mt-2 flex w-full flex-col items-center justify-center gap-1 rounded-xl border border-white/20 bg-white/10 py-2 text-[10px] font-medium leading-tight tracking-wide transition-colors hover:bg-white/20"
            title={lightMode ? "Switch to dark mode" : "Switch to light mode"}
          >
            {lightMode ? <Moon size={13} /> : <Sun size={13} />}
            <span>{lightMode ? "Dark" : "Light"}</span>
          </button>
        </aside>

        <aside className={`scrollbar-left scrollbar-thin hidden overflow-y-auto border-r border-border bg-[hsl(var(--workspace-side))] lg:block ${isStudioSidebarMinimized ? "w-[68px] p-2" : "w-[276px] p-4"}`}>
          {isStudioSidebarMinimized ? (
            <div className="flex h-full flex-col items-center gap-3">
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                onClick={() => setIsStudioSidebarMinimized(false)}
                title="Expand panel"
              >
                <ChevronRight size={14} />
              </Button>
              <button type="button" onClick={onBack} className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-background/40 text-primary" title="Back">
                <ChevronLeft size={14} />
              </button>
              <div className="h-8 w-8 overflow-hidden rounded-lg border border-border bg-secondary">
                {current.avatar ? (
                  <img src={current.avatar} alt={current.name} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-xs font-semibold text-primary">{getInitials(current.name)}</div>
                )}
              </div>
              <button type="button" onClick={() => { onSelectPanel?.("message-ai"); onSelectMessageAI?.(); }} className={`flex h-8 w-8 items-center justify-center rounded-lg ${activePanel === "message-ai" ? "bg-primary/15 text-primary" : "bg-background/40 text-foreground/80 hover:bg-secondary/50"}`} title="Message AI"><MessageCircle size={14} /></button>
              <button type="button" onClick={() => onSelectPanel?.("persona-settings")} className={`flex h-8 w-8 items-center justify-center rounded-lg ${activePanel === "persona-settings" ? "bg-primary/15 text-primary" : "bg-background/40 text-foreground/80 hover:bg-secondary/50"}`} title="Persona Settings"><Settings2 size={14} /></button>
              <button type="button" onClick={() => onSelectPanel?.("memory-upload")} className={`flex h-8 w-8 items-center justify-center rounded-lg ${activePanel === "memory-upload" ? "bg-primary/15 text-primary" : "bg-background/40 text-foreground/80 hover:bg-secondary/50"}`} title="Memory Upload"><Upload size={14} /></button>
              <button type="button" onClick={() => onSelectPanel?.("memory-stack")} className={`flex h-8 w-8 items-center justify-center rounded-lg ${activePanel === "memory-stack" ? "bg-primary/15 text-primary" : "bg-background/40 text-foreground/80 hover:bg-secondary/50"}`} title="Memory Stack"><Database size={14} /></button>
              <button type="button" onClick={() => onSelectPanel?.("advanced")} className={`flex h-8 w-8 items-center justify-center rounded-lg ${activePanel === "advanced" ? "bg-primary/15 text-primary" : "bg-background/40 text-foreground/80 hover:bg-secondary/50"}`} title="Advanced Settings"><Shield size={14} /></button>
            </div>
          ) : (
            <div>
              <div className="mb-3.5 flex items-center justify-between">
                <button onClick={onBack} className="inline-flex items-center text-sm text-primary hover:underline">
                  <ChevronLeft size={14} className="mr-1" />
                  Back
                </button>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8"
                  onClick={() => setIsStudioSidebarMinimized(true)}
                  title="Minimize panel"
                >
                  <ChevronLeft size={16} />
                </Button>
              </div>
              <div className="mb-5 text-center">
                <div className="mx-auto mb-2 h-20 w-20 overflow-hidden rounded-2xl border border-border bg-secondary">
                  {current.avatar ? (
                    <img src={current.avatar} alt={current.name} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full items-center justify-center text-lg font-semibold text-primary">{getInitials(current.name)}</div>
                  )}
                </div>
                <p className="truncate text-[17px] font-semibold leading-tight">{current.name}</p>
                <p className="truncate text-[14px] text-muted-foreground">{current.role}</p>
              </div>

              <div className="space-y-1">
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Message</p>
                <button type="button" onClick={() => { onSelectPanel?.("message-ai"); onSelectMessageAI?.(); }} className={`w-full ${navClass("message-ai")}`}>Message AI</button>
              </div>
              <div className="mt-6 space-y-1">
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Training Studio</p>
                <button type="button" onClick={() => onSelectPanel?.("persona-settings")} className={`flex w-full items-center gap-2 ${navClass("persona-settings")}`}><Settings2 size={15} />Persona Settings</button>
                <button type="button" onClick={() => onSelectPanel?.("memory-upload")} className={`flex w-full items-center gap-2 ${navClass("memory-upload")}`}><Upload size={15} />Memory Upload</button>
                <button type="button" onClick={() => onSelectPanel?.("memory-stack")} className={`flex w-full items-center gap-2 ${navClass("memory-stack")}`}><Database size={15} />Memory Stack</button>
              </div>
              <div className="mt-6 space-y-1">
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Configure</p>
                <button type="button" onClick={() => onSelectPanel?.("advanced")} className={`flex w-full items-center gap-2 ${navClass("advanced")}`}><Shield size={15} />Advanced Settings</button>
              </div>
            </div>
          )}
        </aside>

        <main className="scrollbar-thin h-full min-w-0 flex-1 overflow-y-auto">
          <div className="border-b border-border/70 bg-card/45 px-3 py-3 lg:hidden">
            <button onClick={onBack} className="mb-3 inline-flex items-center text-sm text-primary hover:underline">
              <ChevronLeft size={14} className="mr-1" />
              Back
            </button>
            <div className="mb-3 flex items-center gap-3">
              <div className="h-11 w-11 overflow-hidden rounded-xl border border-border bg-secondary">
                {current.avatar ? (
                  <img src={current.avatar} alt={current.name} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full items-center justify-center text-sm font-semibold text-primary">{getInitials(current.name)}</div>
                )}
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{current.name}</p>
                <p className="truncate text-xs text-muted-foreground">{current.role}</p>
              </div>
            </div>
            <div className="scrollbar-thin flex gap-2 overflow-x-auto">
              <button type="button" onClick={() => { onSelectPanel?.("message-ai"); onSelectMessageAI?.(); }} className={navClass("message-ai")}>Message AI</button>
              <button type="button" onClick={() => onSelectPanel?.("persona-settings")} className={navClass("persona-settings")}>Persona</button>
              <button type="button" onClick={() => onSelectPanel?.("memory-upload")} className={navClass("memory-upload")}>Upload</button>
              <button type="button" onClick={() => onSelectPanel?.("memory-stack")} className={navClass("memory-stack")}>Stack</button>
              <button type="button" onClick={() => onSelectPanel?.("advanced")} className={navClass("advanced")}>Advanced</button>
            </div>
          </div>
          {children}
        </main>
      </div>
    </div>
  );
}

export default function Index() {
  const [lightMode, setLightMode] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("persona-pal-theme") === "light";
  });
  const [personas, setPersonas] = useState<Persona[]>([DEFAULT_DUMMY_PERSONA]);
  const [view, setView] = useState<View>("home");
  const [studioPanel, setStudioPanel] = useState<StudioPanel>("message-ai");
  const [activePersona, setActivePersona] = useState<Persona | null>(null);
  const [editingPersona, setEditingPersona] = useState<Persona | null>(null);
  const [memoryUploadLinkInput, setMemoryUploadLinkInput] = useState("");
  const [messageFilter, setMessageFilter] = useState<MessageFeedFilter>("all");
  const [messageFeeds, setMessageFeeds] = useState<MessageFeedItem[]>(() => [
    {
      id: `dm-${DEFAULT_DUMMY_PERSONA.id}`,
      type: "dm",
      name: DEFAULT_DUMMY_PERSONA.name,
      personaId: DEFAULT_DUMMY_PERSONA.id,
      lastMessage: "Ready to help.",
      lastAt: Date.now(),
      unread: 0,
      pinned: true,
      favorite: true,
    },
    ...CHANNEL_SEEDS.map((c, idx) => ({
      id: c.id,
      type: "channel" as const,
      name: c.name,
      lastMessage: c.lastMessage,
      lastAt: Date.now() - idx * 2_000_000,
      unread: c.unread,
      pinned: false,
      favorite: idx === 0,
    })),
  ]);
  const [activeFeedId, setActiveFeedId] = useState<string>(`dm-${DEFAULT_DUMMY_PERSONA.id}`);
  const memoryUploadFileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.classList.toggle("light", lightMode);
    if (typeof window !== "undefined") {
      window.localStorage.setItem("persona-pal-theme", lightMode ? "light" : "dark");
    }
  }, [lightMode]);

  useEffect(() => {
    setMessageFeeds((prev) => {
      const next = [...prev];
      const personaIds = new Set(personas.map((p) => p.id));

      personas.forEach((persona) => {
        const dmId = `dm-${persona.id}`;
        const existing = next.find((feed) => feed.id === dmId);
        if (existing) {
          existing.name = persona.name;
          existing.personaId = persona.id;
          return;
        }

        next.push({
          id: dmId,
          type: "dm",
          name: persona.name,
          personaId: persona.id,
          lastMessage: "New persona ready to chat.",
          lastAt: Date.now(),
          unread: 0,
          pinned: false,
          favorite: false,
        });
      });

      return next.filter((feed) => feed.type === "channel" || (feed.personaId ? personaIds.has(feed.personaId) : false));
    });
  }, [personas]);

  const currentStudioPersona = editingPersona ?? activePersona ?? DEFAULT_DUMMY_PERSONA;
  const memoryLinks = (currentStudioPersona.providedLinks ?? "").split("\n").map((x) => x.trim()).filter(Boolean);
  const memoryFiles = currentStudioPersona.memoryFiles ?? [];
  const importantChatMemories = currentStudioPersona.importantChatMemories ?? [];
  const messagingDefaults = currentStudioPersona.messagingDefaults ?? DEFAULT_MESSAGING_DEFAULTS;
  const governance = currentStudioPersona.governance ?? DEFAULT_GOVERNANCE;
  const visibleMessageFeeds = messageFeeds
    .filter((feed) => {
      if (messageFilter === "all") return true;
      if (messageFilter === "dms") return feed.type === "dm";
      return feed.type === "channel";
    })
    .sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      if (a.favorite !== b.favorite) return a.favorite ? -1 : 1;
      return b.lastAt - a.lastAt;
    });

  const updatePersona = (id: string, updater: (p: Persona) => Persona) => {
    setPersonas((prev) => prev.map((p) => (p.id === id ? updater(p) : p)));
    setEditingPersona((prev) => (prev && prev.id === id ? updater(prev) : prev));
    setActivePersona((prev) => (prev && prev.id === id ? updater(prev) : prev));
  };

  const buildProvidedKnowledge = (
    files: NonNullable<Persona["memoryFiles"]>,
    memories: NonNullable<Persona["importantChatMemories"]>
  ) => {
    const fileBlock = files.map((f) => `Source file: ${f.name}\n${f.content}`).join("\n\n---\n\n");
    const memoryBlock = memories
      .map((m) => `Saved chat memory (${m.role}) [${new Date(m.createdAt).toISOString()}]\n${m.content}`)
      .join("\n\n---\n\n");
    return [fileBlock, memoryBlock].filter(Boolean).join("\n\n---\n\n").slice(0, MAX_MEMORY_KNOWLEDGE_CHARS);
  };

  const savePersona = (persona: Persona) => {
    const normalizedPersona: Persona = {
      ...persona,
      messagingDefaults: persona.messagingDefaults ?? DEFAULT_MESSAGING_DEFAULTS,
      governance: persona.governance ?? DEFAULT_GOVERNANCE,
    };
    setPersonas((prev) => {
      const idx = prev.findIndex((p) => p.id === normalizedPersona.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = normalizedPersona;
        return next;
      }
      return [normalizedPersona, ...prev];
    });
    setView("home");
    setEditingPersona(null);
  };

  const removeMemoryFile = (name: string, uploadedAt: number) => {
    updatePersona(currentStudioPersona.id, (p) => {
      const next = (p.memoryFiles ?? []).filter((f) => !(f.name === name && f.uploadedAt === uploadedAt));
      return {
        ...p,
        memoryFiles: next,
        providedKnowledge: buildProvidedKnowledge(next, p.importantChatMemories ?? []),
      };
    });
    toast.success("File removed from memory.");
  };

  const saveImportantChatMemory = (role: "user" | "assistant", content: string, createdAt?: number) => {
    const normalized = content.trim();
    if (!normalized) return;
    let inserted = false;

    updatePersona(currentStudioPersona.id, (p) => {
      const existing = p.importantChatMemories ?? [];
      const duplicate = existing.some((m) => m.content === normalized && m.role === role);
      if (duplicate) return p;

      const nextMemories = [
        ...existing,
        {
          id: crypto.randomUUID(),
          role,
          content: normalized.slice(0, 4000),
          createdAt: createdAt ?? Date.now(),
        },
      ].slice(-50);
      inserted = true;

      return {
        ...p,
        importantChatMemories: nextMemories,
        providedKnowledge: buildProvidedKnowledge(p.memoryFiles ?? [], nextMemories),
      };
    });

    if (inserted) toast.success("Saved to memory.");
    else toast("This message is already saved.");
  };

  const removeImportantChatMemory = (id: string) => {
    updatePersona(currentStudioPersona.id, (p) => {
      const nextMemories = (p.importantChatMemories ?? []).filter((m) => m.id !== id);
      return {
        ...p,
        importantChatMemories: nextMemories,
        providedKnowledge: buildProvidedKnowledge(p.memoryFiles ?? [], nextMemories),
      };
    });
    toast.success("Saved chat memory removed.");
  };

  const handleMemoryUploadFiles = async (files: File[]) => {
    if (!files.length) return;
    const loaded: NonNullable<Persona["memoryFiles"]> = [];
    const failed: string[] = [];
    const tooLarge: string[] = [];

    for (const file of files) {
      if (file.size > MAX_MEMORY_UPLOAD_FILE_SIZE) {
        tooLarge.push(file.name);
        continue;
      }
      try {
        const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
        let content = "";
        if (ext === "docx") {
          const arrayBuffer = await file.arrayBuffer();
          const result = await mammoth.extractRawText({ arrayBuffer });
          content = result.value?.trim() ?? "";
        } else {
          content = (await file.text()).trim();
        }
        if (!content) {
          failed.push(file.name);
          continue;
        }
        loaded.push({ name: file.name, content, kind: ext === "docx" ? "docx" : "text", uploadedAt: Date.now() });
      } catch {
        failed.push(file.name);
      }
    }

    if (loaded.length) {
      updatePersona(currentStudioPersona.id, (p) => {
        const next = [...(p.memoryFiles ?? []), ...loaded];
        return {
          ...p,
          memoryFiles: next,
          providedKnowledge: buildProvidedKnowledge(next, p.importantChatMemories ?? []),
        };
      });
      toast.success(`${loaded.length} file(s) uploaded to memory.`);
    }
    if (tooLarge.length) toast.error(`File too large (>1MB): ${tooLarge.join(", ")}`);
    if (failed.length) toast.error(`Could not read: ${failed.join(", ")}`);
  };

  const addMemoryUploadLink = () => {
    const link = memoryUploadLinkInput.trim();
    if (!link) return;
    if (!/^https?:\/\//i.test(link)) {
      toast.error("Please enter a valid URL starting with http:// or https://");
      return;
    }
    if (memoryLinks.includes(link)) {
      toast.error("This link is already in memory.");
      return;
    }
    updatePersona(currentStudioPersona.id, (p) => ({ ...p, providedLinks: [...memoryLinks, link].join("\n") }));
    setMemoryUploadLinkInput("");
    toast.success("Link added to memory.");
  };

  const removeMemoryUploadLink = (link: string) => {
    updatePersona(currentStudioPersona.id, (p) => {
      const next = (p.providedLinks ?? "")
        .split("\n")
        .map((x) => x.trim())
        .filter((x) => x && x !== link);
      return { ...p, providedLinks: next.join("\n") };
    });
    toast.success("Link removed from memory.");
  };

  const addAdvancedTrait = (trait: string) => {
    updatePersona(currentStudioPersona.id, (p) => {
      const current = (p.traits ?? "").split(",").map((x) => x.trim()).filter(Boolean);
      if (current.includes(trait)) return p;
      return { ...p, traits: [...current, trait].join(", ") };
    });
  };

  const updateMessagingDefaults = (updater: (current: NonNullable<Persona["messagingDefaults"]>) => NonNullable<Persona["messagingDefaults"]>) => {
    updatePersona(currentStudioPersona.id, (p) => ({
      ...p,
      messagingDefaults: updater(p.messagingDefaults ?? DEFAULT_MESSAGING_DEFAULTS),
    }));
  };

  const updateGovernance = (updater: (current: NonNullable<Persona["governance"]>) => NonNullable<Persona["governance"]>) => {
    updatePersona(currentStudioPersona.id, (p) => ({
      ...p,
      governance: updater(p.governance ?? DEFAULT_GOVERNANCE),
    }));
  };

  const touchFeed = (id: string, updater: (feed: MessageFeedItem) => MessageFeedItem) => {
    setMessageFeeds((prev) => prev.map((feed) => (feed.id === id ? updater(feed) : feed)));
  };

  const openFeed = (feed: MessageFeedItem) => {
    setActiveFeedId(feed.id);
    touchFeed(feed.id, (f) => ({ ...f, unread: 0 }));

    if (feed.type === "dm" && feed.personaId) {
      const target = personas.find((p) => p.id === feed.personaId);
      if (target) {
        setActivePersona(target);
        setEditingPersona(target);
        setStudioPanel("message-ai");
        setView("chat");
      }
    }
  };

  const toggleFeedPin = (id: string) => {
    touchFeed(id, (feed) => ({ ...feed, pinned: !feed.pinned }));
  };

  const toggleFeedFavorite = (id: string) => {
    touchFeed(id, (feed) => ({ ...feed, favorite: !feed.favorite }));
  };

  const deletePersona = (id: string) => {
    setPersonas((prev) => prev.filter((p) => p.id !== id));
    if (activePersona?.id === id) {
      setActivePersona(DEFAULT_DUMMY_PERSONA);
      setEditingPersona(DEFAULT_DUMMY_PERSONA);
      setActiveFeedId(`dm-${DEFAULT_DUMMY_PERSONA.id}`);
    }
  };
  const startEdit = (p: Persona) => { setEditingPersona(p); setStudioPanel("persona-settings"); setView("edit"); };
  const startClone = (p: Persona) => { setEditingPersona({ ...p, id: crypto.randomUUID(), name: `${p.name} Clone`, createdAt: Date.now() }); setView("edit"); };
  const startChat = (p: Persona) => {
    setActivePersona(p);
    setEditingPersona(p);
    setStudioPanel("message-ai");
    setView("chat");
    setActiveFeedId(`dm-${p.id}`);
    touchFeed(`dm-${p.id}`, (feed) => ({ ...feed, lastAt: Date.now(), unread: 0 }));
  };

  if (view === "chat" && activePersona) {
    return (
      <WorkspaceShell
        persona={activePersona}
        onBack={() => setView("home")}
        activePanel={studioPanel}
        lightMode={lightMode}
        onToggleTheme={() => setLightMode((v) => !v)}
        transparentTopbar
        onSelectPanel={(panel) => {
          setStudioPanel(panel);
          if (panel !== "message-ai") {
            setEditingPersona(activePersona);
            setView("edit");
          }
        }}
        onSelectMessageAI={() => setView("chat")}
      >
        <Toaster position="top-center" theme="dark" richColors />
        <div className="h-full min-h-0">
          <ChatInterface persona={activePersona} onBack={() => setView("home")} onSaveToMemory={saveImportantChatMemory} />
        </div>
      </WorkspaceShell>
    );
  }

  if (view === "create" || view === "edit") {
    return (
      <WorkspaceShell
        persona={editingPersona ?? DEFAULT_DUMMY_PERSONA}
        onBack={() => { setView("home"); setEditingPersona(null); }}
        activePanel={studioPanel}
        lightMode={lightMode}
        onToggleTheme={() => setLightMode((v) => !v)}
        onSelectPanel={setStudioPanel}
        onSelectMessageAI={() => { const target = editingPersona ?? DEFAULT_DUMMY_PERSONA; setActivePersona(target); setView("chat"); }}
      >
        <Toaster position="top-center" theme="dark" richColors />
        <div className="w-full px-3 py-4 sm:px-5 sm:py-6">
          <div className="rounded-2xl border border-border bg-card/85 p-4 shadow-[0_12px_30px_rgba(0,0,0,0.28)] sm:p-6">
            {studioPanel === "persona-settings" && (
              <PersonaForm existing={editingPersona} onSave={savePersona} onCancel={() => { setView("home"); setEditingPersona(null); }} />
            )}

            {studioPanel === "memory-upload" && (
              <div className="space-y-5">
                    <div>
                      <h2 className="text-xl font-semibold">Memory Upload</h2>
                      <p className="text-sm text-muted-foreground">Attach files and links to this persona memory.</p>
                    </div>
                    <section className="space-y-3 rounded-xl border border-border bg-secondary/30 p-4">
                      <input
                        ref={memoryUploadFileInputRef}
                        type="file"
                        multiple
                        className="hidden"
                        accept=".docx,.txt,.md,.markdown,.json,.csv,.ts,.tsx,.js,.jsx,.py,.java,.go,.rb,.php,.css,.scss,.html,.xml,.yml,.yaml,.log"
                        onChange={async (e) => { const files = Array.from(e.target.files ?? []); await handleMemoryUploadFiles(files); e.target.value = ""; }}
                      />
                      <Button type="button" onClick={() => memoryUploadFileInputRef.current?.click()}><Upload size={14} className="mr-1.5" />Upload Files</Button>
                      <div className="flex flex-col gap-2 sm:flex-row">
                        <Input placeholder="https://example.com/reference" value={memoryUploadLinkInput} onChange={(e) => setMemoryUploadLinkInput(e.target.value)} />
                        <Button type="button" variant="outline" onClick={addMemoryUploadLink}>Add Link</Button>
                      </div>
                    </section>
                    <section className="rounded-xl border border-border bg-secondary/20 p-4">
                      <p className="mb-2 text-sm font-medium">Uploaded Files</p>
                      {memoryFiles.length ? (
                        <ul className="space-y-2 text-sm text-muted-foreground">
                          {memoryFiles.map((file) => (
                            <li key={`${file.name}-${file.uploadedAt}`} className="flex items-center justify-between gap-3 rounded-md border border-border/50 bg-background/40 px-3 py-2">
                              <span className="truncate">{file.name}</span>
                              <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-destructive hover:text-destructive" onClick={() => removeMemoryFile(file.name, file.uploadedAt)}>
                                <Trash2 size={12} className="mr-1" />
                                Remove
                              </Button>
                            </li>
                          ))}
                        </ul>
                      ) : <p className="text-sm text-muted-foreground">No files uploaded yet.</p>}
                    </section>
              </div>
            )}

            {studioPanel === "memory-stack" && (
              <div className="space-y-4">
                    <h2 className="text-xl font-semibold">Memory Stack</h2>
                    <div className="rounded-xl border border-border bg-secondary/20 p-4">
                      <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
                        <div className="rounded-lg border border-border bg-background/40 p-3 text-sm">Files: {memoryFiles.length}</div>
                        <div className="rounded-lg border border-border bg-background/40 p-3 text-sm">Links: {memoryLinks.length}</div>
                        <div className="rounded-lg border border-border bg-background/40 p-3 text-sm">Saved Chat: {importantChatMemories.length}</div>
                      </div>
                      <div className="space-y-2">
                        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Memory Files</p>
                        {memoryFiles.length ? (
                          memoryFiles.map((file) => (
                            <div key={`${file.name}-${file.uploadedAt}`} className="flex items-center justify-between gap-3 rounded-md border border-border/50 bg-background/40 px-3 py-2">
                              <span className="truncate text-sm text-muted-foreground">{file.name}</span>
                              <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-destructive hover:text-destructive" onClick={() => removeMemoryFile(file.name, file.uploadedAt)}>
                                <Trash2 size={12} className="mr-1" />
                                Remove
                              </Button>
                            </div>
                          ))
                        ) : <p className="text-sm text-muted-foreground">No memory files.</p>}
                      </div>

                      <div className="mt-4 space-y-2">
                        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Memory Links</p>
                        {memoryLinks.length ? (
                          memoryLinks.map((link) => (
                            <div key={link} className="flex items-center justify-between gap-3 rounded-md border border-border/50 bg-background/40 px-3 py-2">
                              <span className="truncate text-sm text-muted-foreground">{link}</span>
                              <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-destructive hover:text-destructive" onClick={() => removeMemoryUploadLink(link)}>
                                <Trash2 size={12} className="mr-1" />
                                Remove
                              </Button>
                            </div>
                          ))
                        ) : <p className="text-sm text-muted-foreground">No memory links.</p>}
                      </div>

                      <div className="mt-4 space-y-2">
                        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Important Chat Memories</p>
                        {importantChatMemories.length ? (
                          [...importantChatMemories]
                            .sort((a, b) => b.createdAt - a.createdAt)
                            .map((memory) => (
                              <div key={memory.id} className="rounded-md border border-border/50 bg-background/40 px-3 py-2">
                                <div className="mb-1 flex items-center justify-between gap-3">
                                  <p className="text-xs text-muted-foreground">
                                    {memory.role === "assistant" ? "Assistant" : "User"} | {new Date(memory.createdAt).toLocaleString()}
                                  </p>
                                  <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-destructive hover:text-destructive" onClick={() => removeImportantChatMemory(memory.id)}>
                                    <Trash2 size={12} className="mr-1" />
                                    Remove
                                  </Button>
                                </div>
                                <p className="whitespace-pre-wrap text-sm text-muted-foreground">{memory.content}</p>
                              </div>
                            ))
                        ) : <p className="text-sm text-muted-foreground">No important chat memories saved yet.</p>}
                      </div>
                    </div>
              </div>
            )}

            {studioPanel === "advanced" && (
              <div className="space-y-4">
                <h2 className="text-xl font-semibold">Advanced Settings</h2>

                <div className="space-y-4 rounded-xl border border-border bg-secondary/20 p-4">
                  <p className="text-sm font-semibold">Persona Customization</p>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div className="space-y-1.5">
                      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Persona Identity - Name</p>
                      <Input value={currentStudioPersona.name ?? ""} onChange={(e) => updatePersona(currentStudioPersona.id, (p) => ({ ...p, name: e.target.value }))} placeholder="e.g. Katie" />
                    </div>
                    <div className="space-y-1.5">
                      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Persona Identity - Role</p>
                      <Input value={currentStudioPersona.role ?? ""} onChange={(e) => updatePersona(currentStudioPersona.id, (p) => ({ ...p, role: e.target.value }))} placeholder="e.g. CEO" />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div className="space-y-1.5">
                      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Years of Experience</p>
                      <Input value={currentStudioPersona.experience ?? ""} onChange={(e) => updatePersona(currentStudioPersona.id, (p) => ({ ...p, experience: e.target.value }))} placeholder="e.g. 5" />
                    </div>
                    <div className="space-y-1.5">
                      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Skills</p>
                      <Input value={currentStudioPersona.skills ?? ""} onChange={(e) => updatePersona(currentStudioPersona.id, (p) => ({ ...p, skills: e.target.value }))} placeholder="e.g. Strategy, Leadership" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Personality Traits</p>
                    <Input value={currentStudioPersona.traits ?? ""} onChange={(e) => updatePersona(currentStudioPersona.id, (p) => ({ ...p, traits: e.target.value }))} placeholder="e.g. analytical, practical" />
                    <div className="flex flex-wrap gap-1.5">
                      {TRAIT_SUGGESTIONS.map((trait) => (
                        <button key={trait} type="button" onClick={() => addAdvancedTrait(trait)} className="rounded border border-border bg-background/50 px-2 py-0.5 text-xs text-secondary-foreground hover:border-primary/40 hover:bg-primary/10">
                          + {trait}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Communication Style</p>
                    <div className="flex flex-wrap gap-2">
                      {STYLE_OPTIONS.map((style) => (
                        <button
                          key={style}
                          type="button"
                          onClick={() => updatePersona(currentStudioPersona.id, (p) => ({ ...p, communicationStyle: style }))}
                          className={`rounded border px-3 py-1.5 text-xs font-medium ${
                            currentStudioPersona.communicationStyle === style ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background/60 text-secondary-foreground hover:border-primary/40"
                          }`}
                        >
                          {style}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Persona Directive</p>
                    <textarea
                      value={currentStudioPersona.customInstructions ?? ""}
                      onChange={(e) => updatePersona(currentStudioPersona.id, (p) => ({ ...p, customInstructions: e.target.value }))}
                      rows={6}
                      className="w-full rounded-xl border border-border bg-background/60 px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
                      placeholder="Custom directive for persona behavior..."
                    />
                  </div>
                </div>

                <div className="space-y-4 rounded-xl border border-border bg-secondary/20 p-4">
                  <p className="text-sm font-semibold">Messaging Defaults</p>
                  <div className="space-y-1.5">
                    <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Response Length</p>
                    <div className="flex flex-wrap gap-2">
                      {(["brief", "standard", "detailed"] as const).map((size) => (
                        <button
                          key={size}
                          type="button"
                          onClick={() => updateMessagingDefaults((m) => ({ ...m, responseLength: size }))}
                          className={`rounded border px-3 py-1.5 text-xs font-medium ${
                            messagingDefaults.responseLength === size ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background/60 text-secondary-foreground hover:border-primary/40"
                          }`}
                        >
                          {size}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Citation Style</p>
                    <div className="flex flex-wrap gap-2">
                      {(["none", "inline"] as const).map((style) => (
                        <button
                          key={style}
                          type="button"
                          onClick={() => updateMessagingDefaults((m) => ({ ...m, citationStyle: style }))}
                          className={`rounded border px-3 py-1.5 text-xs font-medium ${
                            messagingDefaults.citationStyle === style ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background/60 text-secondary-foreground hover:border-primary/40"
                          }`}
                        >
                          {style}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Review Strictness</p>
                    <div className="flex flex-wrap gap-2">
                      {(["strict", "balanced", "lenient"] as const).map((strictness) => (
                        <button
                          key={strictness}
                          type="button"
                          onClick={() => updateMessagingDefaults((m) => ({ ...m, reviewStrictness: strictness }))}
                          className={`rounded border px-3 py-1.5 text-xs font-medium ${
                            messagingDefaults.reviewStrictness === strictness ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background/60 text-secondary-foreground hover:border-primary/40"
                          }`}
                        >
                          {strictness}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <label className="flex items-center justify-between rounded-lg border border-border bg-background/40 px-3 py-2">
                      <span className="text-sm">Suggest follow-up questions</span>
                      <input type="checkbox" checked={messagingDefaults.includeFollowUpSuggestions} onChange={(e) => updateMessagingDefaults((m) => ({ ...m, includeFollowUpSuggestions: e.target.checked }))} />
                    </label>
                    <label className="flex items-center justify-between rounded-lg border border-border bg-background/40 px-3 py-2">
                      <span className="text-sm">Allow file attachments in chat</span>
                      <input type="checkbox" checked={messagingDefaults.allowAttachments} onChange={(e) => updateMessagingDefaults((m) => ({ ...m, allowAttachments: e.target.checked }))} />
                    </label>
                  </div>
                </div>

                <div className="space-y-4 rounded-xl border border-border bg-secondary/20 p-4">
                  <p className="text-sm font-semibold">Governance Controls</p>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <div className="space-y-1.5">
                      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Privacy Visibility</p>
                      <div className="flex flex-wrap gap-2">
                        {(["private", "workspace", "public"] as const).map((visibility) => (
                          <button
                            key={visibility}
                            type="button"
                            onClick={() => updateGovernance((g) => ({ ...g, visibility }))}
                            className={`rounded border px-3 py-1.5 text-xs font-medium ${
                              governance.visibility === visibility ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background/60 text-secondary-foreground hover:border-primary/40"
                            }`}
                          >
                            {visibility}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Compliance Profile</p>
                      <div className="flex flex-wrap gap-2">
                        {(["none", "gdpr", "hipaa", "soc2"] as const).map((profile) => (
                          <button
                            key={profile}
                            type="button"
                            onClick={() => updateGovernance((g) => ({ ...g, complianceProfile: profile }))}
                            className={`rounded border px-3 py-1.5 text-xs font-medium ${
                              governance.complianceProfile === profile ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background/60 text-secondary-foreground hover:border-primary/40"
                            }`}
                          >
                            {profile.toUpperCase()}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <label className="flex items-center justify-between rounded-lg border border-border bg-background/40 px-3 py-2">
                      <span className="text-sm">Allow publishing and sharing</span>
                      <input type="checkbox" checked={governance.allowSharing} onChange={(e) => updateGovernance((g) => ({ ...g, allowSharing: e.target.checked }))} />
                    </label>
                    <label className="flex items-center justify-between rounded-lg border border-border bg-background/40 px-3 py-2">
                      <span className="text-sm">Allow persona DMs</span>
                      <input type="checkbox" checked={governance.allowPersonaDMs} onChange={(e) => updateGovernance((g) => ({ ...g, allowPersonaDMs: e.target.checked }))} />
                    </label>
                    <label className="flex items-center justify-between rounded-lg border border-border bg-background/40 px-3 py-2">
                      <span className="text-sm">Audit logging</span>
                      <input type="checkbox" checked={governance.auditLogging} onChange={(e) => updateGovernance((g) => ({ ...g, auditLogging: e.target.checked }))} />
                    </label>
                    <label className="flex items-center justify-between rounded-lg border border-border bg-background/40 px-3 py-2">
                      <span className="text-sm">PII guard</span>
                      <input type="checkbox" checked={governance.piiGuard} onChange={(e) => updateGovernance((g) => ({ ...g, piiGuard: e.target.checked }))} />
                    </label>
                  </div>
                  <div className="space-y-1.5">
                    <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Role Permissions</p>
                    <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                      <label className="flex items-center justify-between rounded-lg border border-border bg-background/40 px-3 py-2">
                        <span className="text-sm">Owner/Admin</span>
                        <input type="checkbox" checked={governance.rolePermissions.ownerAdmin} onChange={(e) => updateGovernance((g) => ({ ...g, rolePermissions: { ...g.rolePermissions, ownerAdmin: e.target.checked } }))} />
                      </label>
                      <label className="flex items-center justify-between rounded-lg border border-border bg-background/40 px-3 py-2">
                        <span className="text-sm">Manager</span>
                        <input type="checkbox" checked={governance.rolePermissions.manager} onChange={(e) => updateGovernance((g) => ({ ...g, rolePermissions: { ...g.rolePermissions, manager: e.target.checked } }))} />
                      </label>
                      <label className="flex items-center justify-between rounded-lg border border-border bg-background/40 px-3 py-2">
                        <span className="text-sm">Member</span>
                        <input type="checkbox" checked={governance.rolePermissions.member} onChange={(e) => updateGovernance((g) => ({ ...g, rolePermissions: { ...g.rolePermissions, member: e.target.checked } }))} />
                      </label>
                      <label className="flex items-center justify-between rounded-lg border border-border bg-background/40 px-3 py-2">
                        <span className="text-sm">Viewer</span>
                        <input type="checkbox" checked={governance.rolePermissions.viewer} onChange={(e) => updateGovernance((g) => ({ ...g, rolePermissions: { ...g.rolePermissions, viewer: e.target.checked } }))} />
                      </label>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <div className="space-y-1.5">
                      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Data Retention (days)</p>
                      <Input
                        type="number"
                        min={1}
                        max={3650}
                        value={governance.retentionDays}
                        onChange={(e) => updateGovernance((g) => ({ ...g, retentionDays: Math.max(1, Math.min(3650, Number(e.target.value || 1))) }))}
                      />
                    </div>
                    <div className="rounded-lg border border-border bg-background/40 p-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <Globe size={16} className="text-primary" />
                          <div>
                            <p className="text-sm font-medium">Internet Data Access</p>
                            <p className="text-xs text-muted-foreground">Allow this persona to use internet data for responses.</p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => updatePersona(currentStudioPersona.id, (p) => ({ ...p, internetDataAccess: !(p.internetDataAccess ?? true) }))}
                          className={`relative inline-flex h-6 w-11 items-center rounded-full ${(currentStudioPersona.internetDataAccess ?? true) ? "bg-primary" : "bg-muted"}`}
                        >
                          <span className={`inline-block h-5 w-5 transform rounded-full bg-white ${(currentStudioPersona.internetDataAccess ?? true) ? "translate-x-5" : "translate-x-1"}`} />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                <Button variant="outline" onClick={() => toast.success("Advanced settings saved.")}>Save Advanced Settings</Button>
              </div>
            )}
          </div>
        </div>
      </WorkspaceShell>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Toaster position="top-center" theme="dark" richColors />

      <header className="border-b border-border bg-card/70">
        <div className="flex h-16 w-full items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-primary/40 bg-primary/10">
              <Bot size={16} className="text-primary" />
            </div>
            <div>
              <p className="text-base font-semibold">PersonaPal Studio</p>
              <p className="text-xs text-muted-foreground">Create and manage high quality personas</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-border bg-secondary/70 px-3 py-1.5 text-xs text-muted-foreground">
              <Zap size={12} className="text-primary" />
              {personas.length} persona{personas.length !== 1 ? "s" : ""}
            </div>
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => setLightMode((v) => !v)}
              title={lightMode ? "Switch to dark mode" : "Switch to light mode"}
            >
              {lightMode ? <Moon size={15} /> : <Sun size={15} />}
            </Button>
          </div>
        </div>
      </header>

      <main className="w-full px-4 py-6">
        <>
            <section className="mb-8 rounded-2xl border border-border bg-card/75 p-5 shadow-[0_12px_30px_rgba(0,0,0,0.28)] md:p-7">
              <div className="grid gap-5 md:grid-cols-[1fr_auto] md:items-end">
                <div>
                  <p className="mb-2 text-xs font-medium uppercase tracking-wide text-primary">Client Ready Experience</p>
                  <h1 className="mb-2 text-2xl font-bold md:text-4xl">Create Better Personas, Faster</h1>
                  <p className="max-w-2xl text-sm text-muted-foreground md:text-base">Build role-based assistants with memory upload, source control, and focused response behavior.</p>
                </div>
                <Button onClick={() => setView("create")} className="h-11 w-full rounded-xl bg-primary text-primary-foreground md:w-auto"><Plus size={16} className="mr-1.5" />New Persona</Button>
              </div>
            </section>

            <section className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-border bg-secondary/35 p-4"><p className="text-xs text-muted-foreground">Total Personas</p><p className="text-2xl font-semibold">{personas.length}</p></div>
              <div className="rounded-xl border border-border bg-secondary/35 p-4"><p className="text-xs text-muted-foreground">Memory Enabled</p><p className="text-2xl font-semibold">{personas.filter((p) => (p.memoryFiles?.length ?? 0) > 0).length}</p></div>
              <div className="rounded-xl border border-border bg-secondary/35 p-4"><p className="text-xs text-muted-foreground">Internet Access On</p><p className="text-2xl font-semibold">{personas.filter((p) => p.internetDataAccess ?? true).length}</p></div>
            </section>

            <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              <button onClick={() => setView("create")} className="flex min-h-[220px] flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card/50 p-5 text-center hover:border-primary/55 hover:bg-primary/5">
                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl border border-primary/35 bg-primary/12"><Plus size={22} className="text-primary" /></div>
                <p className="mb-1 text-sm font-semibold">Create New Persona</p>
                <p className="text-xs text-muted-foreground">Start from scratch with custom role and memory behavior.</p>
              </button>

              {personas.map((persona) => (
                <article key={persona.id} className="rounded-2xl border border-border bg-card/85 p-5 shadow-[0_12px_30px_rgba(0,0,0,0.28)]">
                  <div className="mb-4 flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="h-12 w-12 overflow-hidden rounded-xl border border-primary/30 bg-primary/10">
                        {persona.avatar ? (
                          <img src={persona.avatar} alt={persona.name} className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full items-center justify-center text-sm font-semibold text-primary">{getInitials(persona.name)}</div>
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">{persona.name}</p>
                        <p className="truncate text-xs text-muted-foreground">{persona.role}</p>
                      </div>
                    </div>
                    <div className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-1 text-[11px] text-muted-foreground"><Clock size={10} />{persona.experience || "0"}y</div>
                  </div>
                  <p className="mb-5 line-clamp-2 text-xs text-muted-foreground">{persona.background || "Custom persona ready to chat."}</p>
                  <div className="flex gap-2">
                    <Button onClick={() => startChat(persona)} size="sm" className="h-9 flex-1 bg-primary text-primary-foreground hover:opacity-90"><MessageCircle size={14} className="mr-1.5" />Chat</Button>
                    <Button onClick={() => startEdit(persona)} size="sm" variant="outline" className="h-9 w-9 p-0"><Pencil size={14} /></Button>
                    <Button onClick={() => startClone(persona)} size="sm" variant="outline" className="h-9 w-9 p-0"><Copy size={14} /></Button>
                    <Button onClick={() => deletePersona(persona.id)} size="sm" variant="outline" className="h-9 w-9 p-0 hover:border-destructive hover:text-destructive"><Trash2 size={14} /></Button>
                  </div>
                </article>
              ))}
            </section>
        </>
      </main>
    </div>
  );
}
