import { useState } from "react";
import { Persona } from "@/types/persona";
import PersonaForm from "@/components/PersonaForm";
import ChatInterface from "@/components/ChatInterface";
import { Button } from "@/components/ui/button";
import { Plus, MessageCircle, Pencil, Trash2, Bot, Sparkles, Clock, Zap } from "lucide-react";
import { Toaster } from "sonner";

const PRELOADED_PERSONA: Persona = {
  id: "sneh-default",
  name: "Sneh",
  role: "AI Engineer",
  experience: "3",
  skills: "Machine Learning, Deep Learning, NLP, Python",
  traits: "analytical, leadership, problem-solver",
  communicationStyle: "mentor-like",
  background:
    "Team lead working on AI-driven products and scalable ML systems. Passionate about bridging research and production-grade systems, with a focus on LLMs, deployment pipelines, and team mentorship.",
  createdAt: Date.now() - 1000,
};

function getInitials(name: string) {
  return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
}

function PersonaCard({
  persona,
  onChat,
  onEdit,
  onDelete,
}: {
  persona: Persona;
  onChat: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const skills = persona.skills.split(",").slice(0, 3).map((s) => s.trim());
  const isDefault = persona.id === "sneh-default";

  return (
    <div className="group relative bg-card border border-border hover:border-primary/40 rounded-xl p-4 transition-all hover:shadow-lg hover:shadow-primary/5 flex flex-col gap-3">
      {isDefault && (
        <div className="absolute top-3 right-3 flex items-center gap-1 px-2 py-0.5 bg-primary/10 border border-primary/20 rounded-full text-xs text-primary">
          <Sparkles size={10} />
          Example
        </div>
      )}

      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-full overflow-hidden border border-primary/30 bg-primary/15 flex items-center justify-center font-bold text-primary text-sm flex-shrink-0">
          {persona.avatar ? (
            <img src={persona.avatar} alt={persona.name} className="w-full h-full object-cover" />
          ) : (
            getInitials(persona.name)
          )}
        </div>
        <div className="min-w-0">
          <div className="font-semibold text-sm truncate pr-14">{persona.name}</div>
          <div className="text-xs text-muted-foreground flex items-center gap-1 truncate">
            <Clock size={10} />
            {persona.role} · {persona.experience}y
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {skills.map((s) => (
          <span key={s} className="px-2 py-0.5 text-xs rounded-full bg-secondary text-secondary-foreground border border-border/50">
            {s}
          </span>
        ))}
        {persona.skills.split(",").length > 3 && (
          <span className="px-2 py-0.5 text-xs rounded-full bg-muted text-muted-foreground">
            +{persona.skills.split(",").length - 3}
          </span>
        )}
      </div>

      <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
        {persona.background || `${persona.traits} • ${persona.communicationStyle} style`}
      </p>

      <div className="flex gap-2 mt-1">
        <Button
          onClick={onChat}
          size="sm"
          className="flex-1 h-8 bg-primary text-primary-foreground hover:opacity-90 text-xs font-medium"
        >
          <MessageCircle size={13} className="mr-1" />
          Chat
        </Button>
        <Button
          onClick={onEdit}
          size="sm"
          variant="outline"
          className="h-8 w-8 p-0 border-border text-muted-foreground hover:text-foreground"
        >
          <Pencil size={13} />
        </Button>
        {!isDefault && (
          <Button
            onClick={onDelete}
            size="sm"
            variant="outline"
            className="h-8 w-8 p-0 border-border text-muted-foreground hover:text-destructive hover:border-destructive"
          >
            <Trash2 size={13} />
          </Button>
        )}
      </div>
    </div>
  );
}

type View = "home" | "create" | "edit" | "chat";

export default function Index() {
  const [personas, setPersonas] = useState<Persona[]>([PRELOADED_PERSONA]);
  const [view, setView] = useState<View>("home");
  const [activePersona, setActivePersona] = useState<Persona | null>(null);
  const [editingPersona, setEditingPersona] = useState<Persona | null>(null);

  const savePersona = (p: Persona) => {
    setPersonas((prev) => {
      const idx = prev.findIndex((x) => x.id === p.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = p;
        return next;
      }
      return [p, ...prev];
    });
    setView("home");
    setEditingPersona(null);
  };

  const deletePersona = (id: string) => {
    setPersonas((prev) => prev.filter((p) => p.id !== id));
  };

  const startEdit = (p: Persona) => {
    setEditingPersona(p);
    setView("edit");
  };

  const startChat = (p: Persona) => {
    setActivePersona(p);
    setView("chat");
  };

  // Chat view
  if (view === "chat" && activePersona) {
    return (
      <div className="h-screen flex flex-col bg-background">
        <Toaster position="top-center" theme="dark" richColors />
        <ChatInterface persona={activePersona} onBack={() => setView("home")} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Toaster position="top-center" theme="dark" richColors />

      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-border bg-background/80 backdrop-blur-sm">
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-primary/15 border border-primary/30 flex items-center justify-center">
              <Bot size={15} className="text-primary" />
            </div>
            <span className="font-bold text-sm tracking-tight">
              Persona<span className="text-primary">AI</span>
            </span>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Zap size={12} className="text-primary" />
            {personas.length} persona{personas.length !== 1 ? "s" : ""}
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6">
        {/* Create / Edit Form */}
        {(view === "create" || view === "edit") ? (
          <div className="max-w-xl mx-auto">
            <div className="flex items-center gap-2 mb-5">
              <button
                onClick={() => { setView("home"); setEditingPersona(null); }}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                ← Back
              </button>
              <span className="text-muted-foreground">/</span>
              <span className="text-sm font-medium">
                {view === "edit" ? `Edit ${editingPersona?.name}` : "New Persona"}
              </span>
            </div>
            <div className="bg-card border border-border rounded-xl p-5">
              <PersonaForm
                onSave={savePersona}
                onCancel={() => { setView("home"); setEditingPersona(null); }}
                existing={editingPersona}
              />
            </div>
          </div>
        ) : (
          <>
            {/* Hero */}
            <div className="mb-8 text-center">
              <h1 className="text-2xl font-bold tracking-tight mb-1.5">
                Chat with AI{" "}
                <span className="text-primary glow-text">Personas</span>
              </h1>
              <p className="text-sm text-muted-foreground max-w-md mx-auto">
                Create custom AI personalities that respond with domain expertise, unique communication styles, and realistic role-based knowledge.
              </p>
            </div>

            {/* Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* Create card */}
              <button
                onClick={() => setView("create")}
                className="group bg-card/50 border border-dashed border-border hover:border-primary/50 rounded-xl p-4 flex flex-col items-center justify-center gap-2 min-h-[180px] transition-all hover:bg-card"
              >
                <div className="w-10 h-10 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center group-hover:scale-110 transition-transform">
                  <Plus size={20} className="text-primary" />
                </div>
                <span className="text-sm font-medium text-muted-foreground group-hover:text-foreground transition-colors">
                  New Persona
                </span>
                <span className="text-xs text-muted-foreground/60 text-center px-4 leading-relaxed">
                  Define role, skills & personality
                </span>
              </button>

              {/* Persona cards */}
              {personas.map((p) => (
                <PersonaCard
                  key={p.id}
                  persona={p}
                  onChat={() => startChat(p)}
                  onEdit={() => startEdit(p)}
                  onDelete={() => deletePersona(p.id)}
                />
              ))}
            </div>

            {/* Footer hint */}
            <p className="text-center text-xs text-muted-foreground mt-8 opacity-60">
              Personas are stored locally in your session · Last 5 messages kept in context
            </p>
          </>
        )}
      </main>
    </div>
  );
}
