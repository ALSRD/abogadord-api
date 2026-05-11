export type ChatRole = "user" | "assistant";

export type MessageCitation = {
  documentId: string;
  filename: string;
  pageNumber: number | null;
  chunkIndex: number;
  quote: string;
  score?: number;
};

export type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: string;
  citations?: MessageCitation[];
};

export type Conversation = {
  id: string;
  title: string;
  messages: ChatMessage[];
  updatedAt: string;
};

export const createId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

export const createConversation = (): Conversation => ({
  id: createId(),
  title: "Nuevo chat",
  messages: [],
  updatedAt: new Date().toISOString()
});

export const titleFromMessage = (content: string) => {
  const clean = content.replace(/\s+/g, " ").trim();
  return clean.length > 38 ? `${clean.slice(0, 38)}…` : clean || "Nuevo chat";
};
