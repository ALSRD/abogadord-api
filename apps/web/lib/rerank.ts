import { keywordScore, type RagChunk } from "@/lib/rag";

type JinaRerankResponse = {
  results?: Array<{ index: number; relevance_score: number }>;
};

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

function exactPhraseScore(query: string, content: string) {
  const normalizedQuery = query.toLowerCase().trim();
  const normalizedContent = content.toLowerCase();
  if (!normalizedQuery) return 0;
  if (normalizedContent.includes(normalizedQuery)) return 1;

  const quotedPhrases = [...query.matchAll(/["“”']([^"“”']{4,})["“”']/g)].map((match) => match[1].toLowerCase());
  if (!quotedPhrases.length) return 0;
  return quotedPhrases.some((phrase) => normalizedContent.includes(phrase)) ? 0.85 : 0;
}

function localRerankScore(query: string, chunk: RagChunk) {
  const lexical = keywordScore(query, chunk.content);
  const exact = exactPhraseScore(query, chunk.content);
  const headingBoost = /^(.{1,120})\n\n/.test(chunk.content) ? 0.08 : 0;
  const citationBoost = chunk.pageNumber ? 0.04 : 0;
  const originalScore = chunk.score || 0;

  return clamp01(originalScore * 0.45 + lexical * 0.32 + exact * 0.19 + headingBoost + citationBoost);
}

async function jinaRerank(query: string, chunks: RagChunk[]) {
  const apiKey = process.env.JINA_API_KEY;
  if (!apiKey || !chunks.length) return null;

  const response = await fetch("https://api.jina.ai/v1/rerank", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: process.env.JINA_RERANK_MODEL || "jina-reranker-v2-base-multilingual",
      query,
      documents: chunks.map((chunk) => chunk.content),
      top_n: chunks.length
    })
  });

  if (!response.ok) return null;
  const payload = (await response.json()) as JinaRerankResponse;
  if (!payload.results?.length) return null;

  const byIndex = new Map(payload.results.map((result) => [result.index, result.relevance_score]));
  return chunks.map((chunk, index) => ({
    ...chunk,
    reranker: "jina" as const,
    rerankScore: clamp01(byIndex.get(index) || 0),
    score: clamp01((chunk.score || 0) * 0.58 + (byIndex.get(index) || 0) * 0.42)
  }));
}

export async function rerankChunks(query: string, chunks: RagChunk[]) {
  const provider = process.env.RERANK_PROVIDER || (process.env.JINA_API_KEY ? "jina" : "local");
  const candidateLimit = Number(process.env.RERANK_CANDIDATE_LIMIT || 40);
  const candidates = chunks.slice(0, candidateLimit);
  const remaining = chunks.slice(candidateLimit);

  const remoteRanked = provider === "jina" ? await jinaRerank(query, candidates) : null;
  const ranked = remoteRanked || candidates.map((chunk) => {
    const rerankScore = localRerankScore(query, chunk);
    return {
      ...chunk,
      reranker: "local" as const,
      rerankScore,
      score: clamp01((chunk.score || 0) * 0.65 + rerankScore * 0.35)
    };
  });

  return [...ranked.sort((a, b) => (b.score || 0) - (a.score || 0)), ...remaining];
}
