import type { MessageCitation } from "@/lib/chat";
import { getUserId, isSupabaseConfigured, supabaseRest } from "@/lib/supabase-rest";

export const runtime = "edge";

type FeedbackPayload = {
  citations?: MessageCitation[];
  conversationId?: string;
  messageId?: string;
  note?: string;
  rating?: "useful" | "incorrect" | "bad_source";
};

const unavailable = () =>
  Response.json({ error: "Supabase is not configured; feedback requires cloud persistence." }, { status: 503 });

export async function POST(request: Request) {
  if (!isSupabaseConfigured()) return unavailable();

  const userId = await getUserId(request);
  if (!userId) return Response.json({ error: "Missing user identity." }, { status: 401 });

  const body = (await request.json()) as FeedbackPayload;
  if (!body.messageId || !body.rating || !["useful", "incorrect", "bad_source"].includes(body.rating)) {
    return Response.json({ error: "Invalid feedback payload." }, { status: 400 });
  }

  const result = await supabaseRest("message_feedback", {
    method: "POST",
    body: JSON.stringify({
      user_id: userId,
      conversation_id: body.conversationId || null,
      message_id: body.messageId,
      rating: body.rating,
      note: body.note || null,
      citations: body.citations || []
    })
  });

  if (result.error) return Response.json({ error: result.error }, { status: result.status });
  return Response.json({ ok: true });
}
