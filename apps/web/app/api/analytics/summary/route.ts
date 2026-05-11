import { getUserId, isSupabaseConfigured, supabaseRest } from "@/lib/supabase-rest";

export const runtime = "edge";

type FeedbackRow = {
  rating: "useful" | "incorrect" | "bad_source";
};

type TraceRow = {
  candidate_count: number;
  has_evidence: boolean;
  packed_count: number;
  reranker: string | null;
  top_rerank_score: number;
  top_score: number;
};

const unavailable = () =>
  Response.json({ error: "Supabase is not configured; analytics require cloud persistence." }, { status: 503 });

const average = (values: number[]) =>
  values.length ? values.reduce((sum, value) => sum + Number(value || 0), 0) / values.length : 0;

export async function GET(request: Request) {
  if (!isSupabaseConfigured()) return unavailable();

  const userId = await getUserId(request);
  if (!userId) return Response.json({ error: "Missing user identity." }, { status: 401 });

  const traceQuery = new URLSearchParams({
    select: "candidate_count,packed_count,has_evidence,top_score,top_rerank_score,reranker",
    user_id: `eq.${userId}`,
    order: "created_at.desc",
    limit: "200"
  });
  const feedbackQuery = new URLSearchParams({
    select: "rating",
    user_id: `eq.${userId}`,
    order: "created_at.desc",
    limit: "200"
  });

  const [tracesResult, feedbackResult] = await Promise.all([
    supabaseRest<TraceRow[]>(`retrieval_traces?${traceQuery.toString()}`),
    supabaseRest<FeedbackRow[]>(`message_feedback?${feedbackQuery.toString()}`)
  ]);

  if (tracesResult.error) return Response.json({ error: tracesResult.error }, { status: tracesResult.status });
  if (feedbackResult.error) return Response.json({ error: feedbackResult.error }, { status: feedbackResult.status });

  const traces = tracesResult.data || [];
  const feedback = feedbackResult.data || [];
  const negativeFeedback = feedback.filter((row) => row.rating !== "useful");

  return Response.json({
    feedback: {
      badSource: feedback.filter((row) => row.rating === "bad_source").length,
      incorrect: feedback.filter((row) => row.rating === "incorrect").length,
      negativeRate: feedback.length ? negativeFeedback.length / feedback.length : 0,
      total: feedback.length,
      useful: feedback.filter((row) => row.rating === "useful").length
    },
    retrieval: {
      averageCandidates: average(traces.map((trace) => trace.candidate_count)),
      averagePacked: average(traces.map((trace) => trace.packed_count)),
      averageRerankScore: average(traces.map((trace) => trace.top_rerank_score)),
      averageTopScore: average(traces.map((trace) => trace.top_score)),
      evidenceRate: traces.length ? traces.filter((trace) => trace.has_evidence).length / traces.length : 0,
      rerankers: traces.reduce<Record<string, number>>((accumulator, trace) => {
        const key = trace.reranker || "none";
        accumulator[key] = (accumulator[key] || 0) + 1;
        return accumulator;
      }, {}),
      totalQueries: traces.length,
      weakEvidenceRate: traces.length ? traces.filter((trace) => !trace.has_evidence).length / traces.length : 0
    }
  });
}
