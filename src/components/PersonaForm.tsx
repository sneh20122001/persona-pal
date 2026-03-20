import { useState } from "react";
import { Persona } from "@/types/persona";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { User, Briefcase, Clock, Zap, Heart, MessageSquare, FileText, X } from "lucide-react";

interface PersonaFormProps {
  onSave: (persona: Persona) => void;
  onCancel?: () => void;
  existing?: Persona | null;
}

const STYLE_OPTIONS = ["formal", "casual", "mentor-like", "direct", "analytical"];
const TRAIT_SUGGESTIONS = ["analytical", "friendly", "strict", "creative", "empathetic", "leadership", "problem-solver", "detail-oriented"];

export default function PersonaForm({ onSave, onCancel, existing }: PersonaFormProps) {
  const [form, setForm] = useState<Omit<Persona, "id" | "createdAt">>({
    name: existing?.name ?? "",
    role: existing?.role ?? "",
    experience: existing?.experience ?? "",
    skills: existing?.skills ?? "",
    traits: existing?.traits ?? "",
    communicationStyle: existing?.communicationStyle ?? "formal",
    background: existing?.background ?? "",
  });

  const set = (key: keyof typeof form, val: string) =>
    setForm((p) => ({ ...p, [key]: val }));

  const addTrait = (t: string) => {
    const existing = form.traits.split(",").map((s) => s.trim()).filter(Boolean);
    if (!existing.includes(t)) {
      set("traits", [...existing, t].join(", "));
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.role.trim()) return;
    onSave({
      ...form,
      id: existing?.id ?? crypto.randomUUID(),
      createdAt: existing?.createdAt ?? Date.now(),
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Name */}
      <div className="space-y-1.5">
        <Label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">
          <User size={12} /> Name
        </Label>
        <Input
          placeholder="e.g. Sneh Patel"
          value={form.name}
          onChange={(e) => set("name", e.target.value)}
          className="bg-input border-border focus:border-primary text-sm"
          required
        />
      </div>

      {/* Role */}
      <div className="space-y-1.5">
        <Label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">
          <Briefcase size={12} /> Role / Profession
        </Label>
        <Input
          placeholder="e.g. AI Engineer, Product Manager"
          value={form.role}
          onChange={(e) => set("role", e.target.value)}
          className="bg-input border-border focus:border-primary text-sm"
          required
        />
      </div>

      {/* Experience */}
      <div className="space-y-1.5">
        <Label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">
          <Clock size={12} /> Years of Experience
        </Label>
        <Input
          placeholder="e.g. 3"
          value={form.experience}
          onChange={(e) => set("experience", e.target.value)}
          className="bg-input border-border focus:border-primary text-sm"
        />
      </div>

      {/* Skills */}
      <div className="space-y-1.5">
        <Label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">
          <Zap size={12} /> Skills
          <span className="text-muted-foreground font-normal normal-case tracking-normal">(comma-separated)</span>
        </Label>
        <Input
          placeholder="e.g. Machine Learning, Python, NLP"
          value={form.skills}
          onChange={(e) => set("skills", e.target.value)}
          className="bg-input border-border focus:border-primary text-sm"
        />
      </div>

      {/* Personality Traits */}
      <div className="space-y-2">
        <Label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">
          <Heart size={12} /> Personality Traits
        </Label>
        <Input
          placeholder="e.g. analytical, friendly, strict"
          value={form.traits}
          onChange={(e) => set("traits", e.target.value)}
          className="bg-input border-border focus:border-primary text-sm"
        />
        <div className="flex flex-wrap gap-1.5">
          {TRAIT_SUGGESTIONS.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => addTrait(t)}
              className="px-2 py-0.5 rounded text-xs bg-secondary text-secondary-foreground hover:bg-primary hover:text-primary-foreground transition-colors"
            >
              + {t}
            </button>
          ))}
        </div>
      </div>

      {/* Communication Style */}
      <div className="space-y-1.5">
        <Label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">
          <MessageSquare size={12} /> Communication Style
        </Label>
        <div className="flex flex-wrap gap-2">
          {STYLE_OPTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => set("communicationStyle", s)}
              className={`px-3 py-1.5 rounded text-xs font-medium border transition-all ${
                form.communicationStyle === s
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-secondary text-secondary-foreground border-border hover:border-primary/50"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Background */}
      <div className="space-y-1.5">
        <Label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">
          <FileText size={12} /> Background Summary
        </Label>
        <Textarea
          placeholder="A short paragraph about this persona's professional background, focus areas, and what makes them unique..."
          value={form.background}
          onChange={(e) => set("background", e.target.value)}
          className="bg-input border-border focus:border-primary text-sm resize-none min-h-[80px]"
          rows={3}
        />
      </div>

      {/* Actions */}
      <div className="flex gap-2 pt-1">
        <Button type="submit" className="flex-1 bg-primary text-primary-foreground hover:opacity-90 font-medium">
          {existing ? "Update Persona" : "Create Persona"}
        </Button>
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel} className="border-border">
            <X size={16} />
          </Button>
        )}
      </div>
    </form>
  );
}
