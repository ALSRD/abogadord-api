import { getUserId, isSupabaseConfigured, supabaseRest } from "@/lib/supabase-rest";

export const runtime = "edge";

type FeedbackRow = {
  citations: unknown[];
  conversation_id: string | null;
  created_at: string;
  id: string;
  message_id: string | null;
  note: string | null;
  rating: "incorrect" | "bad_source" | "useful";
};

const unavailable = () =>
  Response.json({ error: "Supabase is not configured; review queue requires cloud persistence." }, { status: 503 });

export async function GET(request: Request) {
  if (!isSupabaseConfigured()) return unavailable();

  const userId = await getUserId(request);
  if (!userId) return Response.json({ error: "Missing user identity." }, { status: 401 });

  const query = new URLSearchParams({
    select: "id,conversation_id,message_id,rating,note,citations,created_at",
    user_id: `eq.${userId}`,
    rating: "in.(incorrect,bad_source)",
    order: "created_at.desc",
    limit: "50"
  });

  const result = await supabaseRest<FeedbackRow[]>(`message_feedback?${query.toString()}`);
  if (result.error) return Response.json({ error: result.error }, { status: result.status });

  return Response.json({ items: result.data || [] });
}
