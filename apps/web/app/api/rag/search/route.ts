import { getUserId, isSupabaseConfigured, supabaseRest } from "@/lib/supabase-rest";
import {
  buildRagContext,
  cosineSimilarity,
  createEmbedding,
  hasSufficientEvidence,
  hybridScore,
  keywordScore,
  packRagContext,
  parseSqlVector,
  type Citation,
  type RagChunk
} from "@/lib/rag";
import { rerankChunks } from "@/lib/rerank";

export const runtime = "edge";

type ChunkRow = {
  document_id: string;
  chunk_index: number;
  page_number: number | null;
  content: string;
  embedding: string | number[] | null;
  documents: { filename: string } | null;
};

const unavailable = () =>
  Response.json({ error: "Supabase is not configured; RAG search requires cloud persistence." }, { status: 503 });

export async function POST(request: Request) {
  if (!isSupabaseConfigured()) return unavailable();

  const userId = await getUserId(request);
  if (!userId) return Response.json({ error: "Missing user identity." }, { status: 401 });

  const body = (await request.json()) as { documentIds?: string[]; query?: string; limit?: number };
  const query = body.query?.trim();
  if (!query) return Response.json({ error: "Missing query." }, { status: 400 });

  const embedding = await createEmbedding(query);
  const filters = new URLSearchParams({
    select: "document_id,chunk_index,page_number,content,embedding,documents(filename)",
    user_id: `eq.${userId}`,
    limit: "250"
  });

  if (body.documentIds?.length) {
    filters.set("document_id", `in.(${body.documentIds.join(",")})`);
  }

  const result = await supabaseRest<ChunkRow[]>(`document_chunks?${filters.toString()}`);
  if (result.error) return Response.json({ error: result.error }, { status: result.status });

  const scored = (result.data || [])
    .map((row) => {
      const vector = parseSqlVector(row.embedding);
      const vectorScore = embedding && vector ? cosineSimilarity(embedding, vector) : null;
      const lexicalScore = keywordScore(query, row.content);
      const score = hybridScore(vectorScore, lexicalScore);

      return {
        documentId: row.document_id,
        filename: row.documents?.filename || "Documento",
        pageNumber: row.page_number,
        chunkIndex: row.chunk_index,
        content: row.content,
        quote: row.content.slice(0, 420),
        score,
        keywordScore: lexicalScore,
        vectorScore: vectorScore ?? undefined
      } satisfies RagChunk;
    })
    .filter((chunk) => (chunk.score || 0) > 0.04)
    .sort((a, b) => (b.score || 0) - (a.score || 0));

  const reranked = await rerankChunks(query, scored);
  const packed = packRagContext(reranked).slice(0, Math.min(body.limit || 5, 8));
  const hasEvidence = hasSufficientEvidence(packed);
  const citations: Citation[] = packed.map((chunk) => ({
    documentId: chunk.documentId,
    filename: chunk.filename,
    pageNumber: chunk.pageNumber,
    chunkIndex: chunk.chunkIndex,
    quote: chunk.quote,
    score: chunk.score
  }));
  const metrics = {
    candidateCount: scored.length,
    packedCount: packed.length,
    reranker: packed[0]?.reranker || "none",
    topRerankScore: packed[0]?.rerankScore || 0,
    topScore: packed[0]?.score || 0
  };

  await supabaseRest("retrieval_traces", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      user_id: userId,
      query,
      candidate_count: metrics.candidateCount,
      packed_count: metrics.packedCount,
      has_evidence: hasEvidence,
      top_score: metrics.topScore,
      top_rerank_score: metrics.topRerankScore,
      reranker: metrics.reranker,
      citations
    })
  });

  return Response.json({
    chunks: packed,
    citations,
    context: buildRagContext(packed),
    hasEvidence,
    metrics
  });
}
