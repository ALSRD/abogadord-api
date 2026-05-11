import type { ChatMessage, Conversation } from "@/lib/chat";

const userStorageKey = "abogadord-chat-user-id";

export type ClientIdentity = {
  accessToken: string | null;
  userId: string;
};

export const getClientUserId = () => {
  const saved = window.localStorage.getItem(userStorageKey);
  if (saved) return saved;

  const id = crypto.randomUUID();
  window.localStorage.setItem(userStorageKey, id);
  return id;
};

const headers = (identity: ClientIdentity) => ({
  "Content-Type": "application/json",
  "x-abogadord-user-id": identity.userId,
  ...(identity.accessToken ? { Authorization: `Bearer ${identity.accessToken}` } : {})
});

export async function fetchRemoteConversations(identity: ClientIdentity) {
  const response = await fetch("/api/conversations", { headers: headers(identity) });
  if (!response.ok) return null;
  return (await response.json()) as { conversations: Conversation[] };
}

export async function createRemoteConversation(identity: ClientIdentity, conversation: Conversation) {
  const response = await fetch("/api/conversations", {
    method: "POST",
    headers: headers(identity),
    body: JSON.stringify(conversation)
  });

  return response.ok;
}

export async function updateRemoteConversationTitle(identity: ClientIdentity, conversationId: string, title: string) {
  const response = await fetch("/api/conversations", {
    method: "PATCH",
    headers: headers(identity),
    body: JSON.stringify({ id: conversationId, title })
  });

  return response.ok;
}

export async function fetchRemoteMessages(identity: ClientIdentity, conversationId: string) {
  const response = await fetch(`/api/conversations/${conversationId}/messages`, { headers: headers(identity) });
  if (!response.ok) return null;
  return (await response.json()) as { messages: ChatMessage[] };
}

export async function persistRemoteMessage(identity: ClientIdentity, conversationId: string, message: ChatMessage) {
  const response = await fetch(`/api/conversations/${conversationId}/messages`, {
    method: "POST",
    headers: headers(identity),
    body: JSON.stringify(message)
  });

  return response.ok;
}

export type DocumentSummary = {
  id: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
  status: string;
  created_at: string;
};

export async function fetchDocuments(identity: ClientIdentity) {
  const response = await fetch("/api/documents", { headers: headers(identity) });
  if (!response.ok) return null;
  return (await response.json()) as { documents: DocumentSummary[] };
}

export async function uploadDocument(identity: ClientIdentity, file: File) {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch("/api/documents", {
    method: "POST",
    headers: {
      "x-abogadord-user-id": identity.userId,
      ...(identity.accessToken ? { Authorization: `Bearer ${identity.accessToken}` } : {})
    },
    body: formData
  });

  if (!response.ok) return null;
  return (await response.json()) as { document: DocumentSummary; chunks: number };
}

export async function searchRag(identity: ClientIdentity, query: string) {
  const response = await fetch("/api/rag/search", {
    method: "POST",
    headers: headers(identity),
    body: JSON.stringify({ query, limit: 5 })
  });

  if (!response.ok) return null;
  return (await response.json()) as {
    context: string;
    citations: import("@/lib/chat").MessageCitation[];
    hasEvidence: boolean;
    metrics?: { candidateCount: number; packedCount: number; topScore: number };
  };
}

export type FeedbackRating = "useful" | "incorrect" | "bad_source";

export async function submitMessageFeedback(
  identity: ClientIdentity,
  payload: {
    citations?: import("@/lib/chat").MessageCitation[];
    conversationId?: string;
    messageId: string;
    note?: string;
    rating: FeedbackRating;
  }
) {
  const response = await fetch("/api/feedback", {
    method: "POST",
    headers: headers(identity),
    body: JSON.stringify(payload)
  });

  return response.ok;
}

export type AnalyticsSummary = {
  feedback: {
    badSource: number;
    incorrect: number;
    negativeRate: number;
    total: number;
    useful: number;
  };
  retrieval: {
    averageCandidates: number;
    averagePacked: number;
    averageRerankScore: number;
    averageTopScore: number;
    evidenceRate: number;
    rerankers: Record<string, number>;
    totalQueries: number;
    weakEvidenceRate: number;
  };
};

export type ReviewQueueItem = {
  citations: import("@/lib/chat").MessageCitation[];
  conversation_id: string | null;
  created_at: string;
  id: string;
  message_id: string | null;
  note: string | null;
  rating: FeedbackRating;
};

export async function fetchAnalyticsSummary(identity: ClientIdentity) {
  const response = await fetch("/api/analytics/summary", { headers: headers(identity) });
  if (!response.ok) return null;
  return (await response.json()) as AnalyticsSummary;
}

export async function fetchReviewQueue(identity: ClientIdentity) {
  const response = await fetch("/api/review-queue", { headers: headers(identity) });
  if (!response.ok) return null;
  return (await response.json()) as { items: ReviewQueueItem[] };
}
