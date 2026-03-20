import { useState } from "react";
import { Persona } from "@/types/persona";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { User, X, Sparkles, RefreshCw } from "lucide-react";
import { toast } from "sonner";

interface PersonaFormProps {
  onSave: (persona: Persona) => void;
  onCancel?: () => void;
  existing?: Persona | null;
}

const NAME_MAX = 50;
const ROLE_MAX = 50;
const DESCRIPTION_MAX = 400;

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const AVATAR_URL = `${SUPABASE_URL}/functions/v1/generate-avatar`;

function getAutoDescription(name: string, role: string) {
  const safeName = name.trim() || "This persona";
  const safeRole = role.trim() || "professional assistant";
  return `${safeName} operates as a ${safeRole}, focused on practical execution, clear communication, and outcome-driven support for business and operational decisions.`;
}

function getAutoDirective(name: string, role: string, description: string) {
  const safeName = name.trim() || "Persona";
  const safeRole = role.trim() || "Professional Advisor";
  const safeDescription = description.trim() || `${safeName} helps users with practical guidance.`;
  return `You are ${safeName}, acting as ${safeRole}.

ROLE & PURPOSE:
${safeDescription}

RESPONSE RULES:
- Answer directly and to the point.
- For reviews, list missing items and required changes clearly.
- Use concise, structured output.
- Do not include unrelated content.`;
}

export default function PersonaForm({ onSave, onCancel, existing }: PersonaFormProps) {
  const [form, setForm] = useState<Omit<Persona, "id" | "createdAt">>({
    name: existing?.name ?? "",
    role: existing?.role ?? "",
    experience: existing?.experience ?? "",
    skills: existing?.skills ?? "",
    traits: existing?.traits ?? "",
    communicationStyle: existing?.communicationStyle ?? "formal",
    background: existing?.background ?? "",
    avatar: existing?.avatar ?? "",
    gender: existing?.gender ?? "female",
    knowledgeSource: existing?.knowledgeSource ?? "internet",
    providedKnowledge: existing?.providedKnowledge ?? "",
    providedLinks: existing?.providedLinks ?? "",
    conversationStarters: existing?.conversationStarters ?? [],
    memoryFiles: existing?.memoryFiles ?? [],
    importantChatMemories: existing?.importantChatMemories ?? [],
    customInstructions: existing?.customInstructions ?? "",
    messagingDefaults: existing?.messagingDefaults ?? {
      responseLength: "brief",
      includeFollowUpSuggestions: true,
      citationStyle: "none",
      allowAttachments: true,
      reviewStrictness: "balanced",
    },
    governance: existing?.governance ?? {
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
    },
  });

  const [generatingAvatar, setGeneratingAvatar] = useState(false);

  const set = (key: keyof typeof form, val: string) =>
    setForm((p) => ({ ...p, [key]: val }));

  const generateAvatar = async () => {
    if (!form.name.trim() || !form.role.trim()) {
      toast.error("Fill in Name and Role first");
      return;
    }

    setGeneratingAvatar(true);
    try {
      const res = await fetch(AVATAR_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ name: form.name, role: form.role, traits: form.traits, gender: form.gender }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        toast.error(data.error ?? "Avatar generation failed");
        return;
      }
      setForm((p) => ({ ...p, avatar: data.avatar }));
      toast.success(`Avatar generated${data.usedGender ? ` (${data.usedGender})` : ""}!`);
    } catch {
      toast.error("Failed to generate avatar");
    } finally {
      setGeneratingAvatar(false);
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
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="rounded-2xl border border-border bg-card/85 p-5 shadow-[0_12px_30px_rgba(0,0,0,0.28)]">
        <div className="flex flex-col items-center">
          <div className="relative">
            <div className="h-28 w-28 overflow-hidden rounded-3xl border-2 border-border bg-secondary">
              {form.avatar ? (
                <img src={form.avatar} alt="Persona avatar" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full items-center justify-center text-muted-foreground">
                  <User size={36} />
                </div>
              )}
            </div>
            {generatingAvatar && (
              <div className="absolute inset-0 flex items-center justify-center rounded-3xl bg-background/70">
                <RefreshCw size={20} className="animate-spin text-primary" />
              </div>
            )}
          </div>

          <div className="mt-3 flex flex-wrap justify-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={generateAvatar} disabled={generatingAvatar}>
              <Sparkles size={12} className="mr-1.5" />
              {form.avatar ? "Regenerate" : "Generate Avatar"}
            </Button>
            <Select value={form.gender} onValueChange={(v) => setForm((p) => ({ ...p, gender: v as "male" | "female" }))}>
              <SelectTrigger className="h-8 w-[120px] bg-input border-border text-xs">
                <SelectValue placeholder="Gender" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="male">Male</SelectItem>
                <SelectItem value="female">Female</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <Label className="mb-1.5 block text-sm font-semibold">Persona Name</Label>
            <div className="relative">
              <Input
                value={form.name}
                maxLength={NAME_MAX}
                onChange={(e) => set("name", e.target.value)}
                className="h-11 pr-10"
                placeholder="Katie"
                required
              />
              {form.name && (
                <button
                  type="button"
                  onClick={() => set("name", "")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X size={16} />
                </button>
              )}
            </div>
            <p className="mt-1 text-right text-xs text-muted-foreground">{form.name.length}/{NAME_MAX}</p>
          </div>

          <div>
            <Label className="mb-1.5 block text-sm font-semibold">Persona Role</Label>
            <div className="relative">
              <Input
                value={form.role}
                maxLength={ROLE_MAX}
                onChange={(e) => set("role", e.target.value)}
                className="h-11 pr-10"
                placeholder="CEO"
                required
              />
              {form.role && (
                <button
                  type="button"
                  onClick={() => set("role", "")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X size={16} />
                </button>
              )}
            </div>
            <p className="mt-1 text-right text-xs text-muted-foreground">{form.role.length}/{ROLE_MAX}</p>
          </div>
        </div>

        <div className="mt-4">
          <Label className="mb-1.5 block text-sm font-semibold">Persona Description</Label>
          <div className="relative">
            <Input
              value={form.background}
              maxLength={DESCRIPTION_MAX}
              onChange={(e) => set("background", e.target.value)}
              className="h-11 pr-20"
              placeholder="This persona operates as..."
            />
            {form.background && (
              <button
                type="button"
                onClick={() => set("background", "")}
                className="absolute right-11 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X size={16} />
              </button>
            )}
            <button
              type="button"
              onClick={() => set("background", getAutoDescription(form.name, form.role))}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md border border-primary/30 bg-primary/10 p-1.5 text-primary hover:bg-primary/20"
              title="Auto generate description"
            >
              <Sparkles size={14} />
            </button>
          </div>
          <p className="mt-1 text-right text-xs text-muted-foreground">{form.background.length}/{DESCRIPTION_MAX}</p>
        </div>

        <div className="mt-4">
          <div className="mb-1.5 flex items-center justify-between">
            <Label className="text-sm font-semibold">Custom Directive</Label>
            <button
              type="button"
              onClick={() => set("customInstructions", getAutoDirective(form.name, form.role, form.background))}
              className="text-xs text-primary hover:underline"
            >
              Auto Draft
            </button>
          </div>
          <Textarea
            value={form.customInstructions ?? ""}
            onChange={(e) => set("customInstructions", e.target.value)}
            rows={8}
            className="resize-none bg-input/70 text-sm leading-relaxed"
            placeholder="Write custom persona instruction..."
          />
        </div>
      </div>

      <div className="sticky bottom-0 z-10 border-t border-border bg-background/95 px-1 py-3 backdrop-blur-sm">
        <div className="flex gap-2">
          {onCancel && (
            <Button type="button" variant="outline" onClick={onCancel} className="border-border">
              Cancel
            </Button>
          )}
          <Button type="submit" className="ml-auto bg-primary text-primary-foreground hover:opacity-90 font-medium">
            {existing ? "Save Changes" : "Save"}
          </Button>
        </div>
      </div>
    </form>
  );
}
