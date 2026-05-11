import type { ChatMessage, MessageCitation } from "@/lib/chat";
import { getUserId, isSupabaseConfigured, supabaseRest } from "@/lib/supabase-rest";

export const runtime = "edge";

type MessageRow = {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations?: unknown[];
  created_at: string;
};

const unavailable = () =>
  Response.json({ error: "Supabase is not configured; client should use localStorage fallback." }, { status: 503 });

async function ownsConversation(conversationId: string, userId: string) {
  const query = new URLSearchParams({ select: "id", id: `eq.${conversationId}`, user_id: `eq.${userId}`, limit: "1" });
  const result = await supabaseRest<Array<{ id: string }>>(`conversations?${query.toString()}`);
  return Boolean(result.data?.length);
}

export async function GET(request: Request, context: { params: Promise<{ conversationId: string }> }) {
  if (!isSupabaseConfigured()) return unavailable();

  const userId = await getUserId(request);
  if (!userId) return Response.json({ error: "Missing x-abogadord-user-id header." }, { status: 401 });

  const { conversationId } = await context.params;
  if (!(await ownsConversation(conversationId, userId))) {
    return Response.json({ error: "Conversation not found." }, { status: 404 });
  }

  const query = new URLSearchParams({
    select: "id,role,content,citations,created_at",
    conversation_id: `eq.${conversationId}`,
    order: "created_at.asc"
  });

  const result = await supabaseRest<MessageRow[]>(`messages?${query.toString()}`);
  if (result.error) return Response.json({ error: result.error }, { status: result.status });

  const messages: ChatMessage[] = (result.data || []).map((row) => ({
    id: row.id,
    role: row.role,
    content: row.content,
    citations: Array.isArray(row.citations) ? (row.citations as MessageCitation[]) : [],
    createdAt: row.created_at
  }));

  return Response.json({ messages });
}

export async function POST(request: Request, context: { params: Promise<{ conversationId: string }> }) {
  if (!isSupabaseConfigured()) return unavailable();

  const userId = await getUserId(request);
  if (!userId) return Response.json({ error: "Missing x-abogadord-user-id header." }, { status: 401 });

  const { conversationId } = await context.params;
  if (!(await ownsConversation(conversationId, userId))) {
    return Response.json({ error: "Conversation not found." }, { status: 404 });
  }

  const body = (await request.json()) as ChatMessage;
  if (!body.id || !body.content || !["user", "assistant"].includes(body.role)) {
    return Response.json({ error: "Invalid message payload." }, { status: 400 });
  }

  const result = await supabaseRest<MessageRow[]>("messages", {
    method: "POST",
    body: JSON.stringify({
      id: body.id,
      conversation_id: conversationId,
      role: body.role,
      content: body.content,
      citations: body.citations || [],
      created_at: body.createdAt || new Date().toISOString()
    })
  });

  if (result.error) return Response.json({ error: result.error }, { status: result.status });

  await supabaseRest(`conversations?id=eq.${conversationId}&user_id=eq.${userId}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ updated_at: new Date().toISOString() })
  });

  return Response.json({ message: result.data?.[0] });
}
