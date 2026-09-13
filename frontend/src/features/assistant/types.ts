export type MessageRole = "user" | "assistant";

export type ChatMessage = {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: number;
};

export type AssistantStatus = "idle" | "thinking" | "streaming" | "error";

export type Suggestion = {
  label: string;
  query: string;
};
