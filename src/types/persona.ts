export interface Persona {
  id: string;
  name: string;
  role: string;
  experience: string;
  skills: string;
  traits: string;
  communicationStyle: string;
  background: string;
  createdAt: number;
  avatar?: string; // base64 data URL
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}
