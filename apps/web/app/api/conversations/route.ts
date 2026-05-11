import { createConversation, type Conversation } from "@/lib/chat";
import { getUserId, isSupabaseConfigured, supabaseRest } from "@/lib/supabase-rest";

export const runtime = "edge";

type ConversationRow = {
  id: string;
  title: string;
  updated_at: string;
};

const unavailable = () =>
  Response.json({ error: "Supabase is not configured; client should use localStorage fallback." }, { status: 503 });

export async function GET(request: Request) {
  if (!isSupabaseConfigured()) return unavailable();

  const userId = await getUserId(request);
  if (!userId) return Response.json({ error: "Missing x-abogadord-user-id header." }, { status: 401 });

  const query = new URLSearchParams({
    select: "id,title,updated_at",
    user_id: `eq.${userId}`,
    order: "updated_at.desc"
  });

  const result = await supabaseRest<ConversationRow[]>(`conversations?${query.toString()}`);
  if (result.error) return Response.json({ error: result.error }, { status: result.status });

  const conversations: Conversation[] = (result.data || []).map((row) => ({
    id: row.id,
    title: row.title,
    messages: [],
    updatedAt: row.updated_at
  }));

  return Response.json({ conversations });
}

export async function POST(request: Request) {
  if (!isSupabaseConfigured()) return unavailable();

  const userId = await getUserId(request);
  if (!userId) return Response.json({ error: "Missing x-abogadord-user-id header." }, { status: 401 });

  const body = (await request.json()) as Partial<Conversation>;
  const conversation = body.id ? body : createConversation();

  const result = await supabaseRest<ConversationRow[]>("conversations", {
    method: "POST",
    body: JSON.stringify({
      id: conversation.id,
      user_id: userId,
      title: conversation.title || "Nuevo chat",
      updated_at: conversation.updatedAt || new Date().toISOString()
    })
  });

  if (result.error) return Response.json({ error: result.error }, { status: result.status });
  return Response.json({ conversation: result.data?.[0] });
}

export async function PATCH(request: Request) {
  if (!isSupabaseConfigured()) return unavailable();

  const userId = await getUserId(request);
  if (!userId) return Response.json({ error: "Missing x-abogadord-user-id header." }, { status: 401 });

  const body = (await request.json()) as { id?: string; title?: string };
  if (!body.id || !body.title) return Response.json({ error: "Missing conversation id or title." }, { status: 400 });

  const result = await supabaseRest<ConversationRow[]>(`conversations?id=eq.${body.id}&user_id=eq.${userId}`, {
    method: "PATCH",
    body: JSON.stringify({ title: body.title, updated_at: new Date().toISOString() })
  });

  if (result.error) return Response.json({ error: result.error }, { status: result.status });
  return Response.json({ conversation: result.data?.[0] });
}
