export interface Persona {
  id: string;
  name: string;
  role: string;
  experience: string;
  skills: string;
  traits: string;
  communicationStyle: string;
  background: string;
  customInstructions?: string;
  createdAt: number;
  avatar?: string; // base64 data URL
  gender?: "male" | "female";
  knowledgeSource?: "internet" | "provided" | "both";
  internetDataAccess?: boolean;
  providedKnowledge?: string;
  providedLinks?: string;
  conversationStarters?: string[];
  memoryFiles?: Array<{
    name: string;
    content: string;
    kind?: "docx" | "text";
    uploadedAt: number;
  }>;
  importantChatMemories?: Array<{
    id: string;
    role: "user" | "assistant";
    content: string;
    createdAt: number;
  }>;
  messagingDefaults?: {
    responseLength: "brief" | "standard" | "detailed";
    includeFollowUpSuggestions: boolean;
    citationStyle: "none" | "inline";
    allowAttachments: boolean;
    reviewStrictness: "strict" | "balanced" | "lenient";
  };
  governance?: {
    visibility: "private" | "workspace" | "public";
    allowSharing: boolean;
    allowPersonaDMs: boolean;
    rolePermissions: {
      ownerAdmin: boolean;
      manager: boolean;
      member: boolean;
      viewer: boolean;
    };
    complianceProfile: "none" | "gdpr" | "hipaa" | "soc2";
    retentionDays: number;
    auditLogging: boolean;
    piiGuard: boolean;
  };
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  createdAt?: number;
  attachments?: Array<{
    name: string;
    language?: string;
    content: string;
    kind?: "docx" | "text";
    previewHtml?: string;
  }>;
}
