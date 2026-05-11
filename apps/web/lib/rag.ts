export type Citation = {
  documentId: string;
  filename: string;
  pageNumber: number | null;
  chunkIndex: number;
  quote: string;
  score?: number;
};

export type SemanticChunk = {
  content: string;
  heading: string | null;
  pageNumber: number | null;
};

export type RagChunk = Citation & {
  content: string;
  embedding?: number[] | null;
  keywordScore?: number;
  reranker?: "local" | "jina";
  rerankScore?: number;
  vectorScore?: number;
};

const maxChunkCharacters = 1200;
const chunkOverlapCharacters = 180;
const legalReferencePattern = /\b(?:art(?:í|i)culo|art\.?|ley|sentencia|resoluci(?:ó|o)n|decreto|contrato|cl(?:á|a)usula)\s+[\w.-]+/gi;

export function normalizeDocumentText(text: string) {
  return text
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function splitIntoPages(text: string) {
  const normalized = normalizeDocumentText(text);
  if (!normalized) return [];

  const explicitPages = normalized.split(/\n\s*(?:---\s*)?(?:p(?:á|a)gina|page)\s+\d+\s*(?:---)?\s*\n/gi);
  if (explicitPages.length > 1) {
    return explicitPages.filter(Boolean).map((content, index) => ({ content: content.trim(), pageNumber: index + 1 }));
  }

  return normalized.split(/\f+/g).filter(Boolean).map((content, index) => ({ content: content.trim(), pageNumber: index + 1 }));
}

function isHeading(line: string) {
  const trimmed = line.trim();
  return (
    /^#{1,4}\s+/.test(trimmed) ||
    /^\d+(?:\.\d+)*[.)-]?\s+[A-ZÁÉÍÓÚÑ]/.test(trimmed) ||
    /^(?:cap(?:í|i)tulo|secci(?:ó|o)n|t(?:í|i)tulo|cl(?:á|a)usula|art(?:í|i)culo)\b/i.test(trimmed) ||
    (trimmed.length <= 90 && trimmed === trimmed.toUpperCase() && /[A-ZÁÉÍÓÚÑ]/.test(trimmed))
  );
}

function pushSectionChunks(target: SemanticChunk[], section: string, heading: string | null, pageNumber: number | null) {
  const clean = normalizeDocumentText(section);
  if (!clean) return;

  let cursor = 0;
  while (cursor < clean.length) {
    const end = Math.min(cursor + maxChunkCharacters, clean.length);
    const slice = clean.slice(cursor, end);
    const paragraphBoundary = slice.lastIndexOf("\n\n");
    const sentenceBoundary = Math.max(slice.lastIndexOf(". "), slice.lastIndexOf("; "));
    const boundary = paragraphBoundary > 400 ? paragraphBoundary : sentenceBoundary > 500 ? sentenceBoundary + 1 : slice.length;
    const content = slice.slice(0, boundary).trim();

    if (content) target.push({ content: heading ? `${heading}\n\n${content}` : content, heading, pageNumber });
    if (end >= clean.length) break;
    cursor += Math.max(boundary - chunkOverlapCharacters, Math.min(boundary, maxChunkCharacters));
  }
}

export function chunkText(text: string): SemanticChunk[] {
  const pages = splitIntoPages(text);
  const chunks: SemanticChunk[] = [];

  for (const page of pages) {
    const lines = page.content.split("\n");
    let currentHeading: string | null = null;
    let section = "";

    for (const line of lines) {
      if (isHeading(line) && section.trim()) {
        pushSectionChunks(chunks, section, currentHeading, page.pageNumber);
        currentHeading = line.replace(/^#{1,4}\s+/, "").trim();
        section = "";
        continue;
      }

      if (isHeading(line)) currentHeading = line.replace(/^#{1,4}\s+/, "").trim();
      section += `${line}\n`;
    }

    pushSectionChunks(chunks, section, currentHeading, page.pageNumber);
  }

  return chunks;
}

export function embeddingToSqlVector(embedding: number[]) {
  return `[${embedding.map((value) => Number(value).toFixed(8)).join(",")}]`;
}

export function parseSqlVector(value: string | number[] | null | undefined) {
  if (!value) return null;
  if (Array.isArray(value)) return value;
  return value.replace(/^\[|\]$/g, "").split(",").map((part) => Number(part)).filter(Number.isFinite);
}

export function cosineSimilarity(a: number[], b: number[]) {
  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let index = 0; index < Math.min(a.length, b.length); index += 1) {
    dot += a[index] * b[index];
    normA += a[index] * a[index];
    normB += b[index] * b[index];
  }

  if (!normA || !normB) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export function keywordScore(query: string, content: string) {
  const queryTerms = tokenize(query);
  if (!queryTerms.length) return 0;

  const contentTerms = new Set(tokenize(content));
  const matchedTerms = queryTerms.filter((term) => contentTerms.has(term)).length;
  const legalRefs = query.match(legalReferencePattern) || [];
  const legalRefBoost = legalRefs.filter((reference) => content.toLowerCase().includes(reference.toLowerCase())).length * 0.18;

  return Math.min(matchedTerms / queryTerms.length + legalRefBoost, 1);
}

export function hybridScore(vectorScore: number | null, keyword: number) {
  if (vectorScore === null) return keyword;
  return vectorScore * 0.72 + keyword * 0.28;
}

function tokenize(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/[^a-z0-9ñ]+/i)
    .filter((term) => term.length > 2);
}

export async function createEmbedding(input: string) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small",
      input
    })
  });

  if (!response.ok) return null;

  const payload = (await response.json()) as { data?: Array<{ embedding: number[] }> };
  return payload.data?.[0]?.embedding || null;
}

export function buildRagContext(chunks: RagChunk[]) {
  return chunks
    .map((chunk, index) => {
      const page = chunk.pageNumber ? `pág. ${chunk.pageNumber}` : "pág. n/d";
      return `[Fuente ${index + 1}: ${chunk.filename} · ${page} · chunk ${chunk.chunkIndex}]
${chunk.content}`;
    })
    .join("\n\n---\n\n");
}

export function deduplicateChunks(chunks: RagChunk[]) {
  const seen = new Set<string>();
  return chunks.filter((chunk) => {
    const normalized = tokenize(chunk.content).slice(0, 80).join(" ");
    const key = `${chunk.documentId}:${chunk.pageNumber || "x"}:${normalized}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function packRagContext(chunks: RagChunk[], maxCharacters = Number(process.env.RAG_CONTEXT_MAX_CHARS || 5200)) {
  const deduped = deduplicateChunks(chunks);
  const selected: RagChunk[] = [];
  const documentCounts = new Map<string, number>();
  let usedCharacters = 0;

  for (const chunk of deduped) {
    const perDocumentCount = documentCounts.get(chunk.documentId) || 0;
    if (perDocumentCount >= 3 && selected.length >= 3) continue;
    if (usedCharacters + chunk.content.length > maxCharacters && selected.length >= 2) continue;

    selected.push(chunk);
    documentCounts.set(chunk.documentId, perDocumentCount + 1);
    usedCharacters += chunk.content.length;

    if (usedCharacters >= maxCharacters) break;
  }

  return selected;
}

export function hasSufficientEvidence(chunks: RagChunk[]) {
  if (!chunks.length) return false;
  const bestScore = Math.max(...chunks.map((chunk) => chunk.score || 0));
  return bestScore >= Number(process.env.RAG_MIN_CONFIDENCE || 0.12);
}
