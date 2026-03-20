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
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}
