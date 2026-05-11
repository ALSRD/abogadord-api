import { getUserId, isSupabaseConfigured, supabaseRest } from "@/lib/supabase-rest";
import { chunkText, createEmbedding, embeddingToSqlVector } from "@/lib/rag";

export const runtime = "edge";

type DocumentRow = {
  id: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
  status: string;
  created_at: string;
};

type ChunkRow = { id: string };

const maxUploadBytes = Number(process.env.MAX_DOCUMENT_UPLOAD_BYTES || 10 * 1024 * 1024);
const maxChunksPerDocument = Number(process.env.MAX_CHUNKS_PER_DOCUMENT || 80);

const unavailable = () =>
  Response.json({ error: "Supabase is not configured; documents require cloud persistence." }, { status: 503 });

const textFromFile = async (file: File) => {
  if (file.type.startsWith("text/") || file.name.match(/\.(md|txt|csv|json)$/i)) {
    return file.text();
  }

  if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
    const raw = await file.text();
    return raw
      .replace(/\0/g, " ")
      .replace(/[^\x09\x0A\x0D\x20-\x7EÁÉÍÓÚáéíóúÑñÜü]/g, " ")
      .replace(/\s{2,}/g, " ")
      .trim();
  }

  return "";
};

export async function GET(request: Request) {
  if (!isSupabaseConfigured()) return unavailable();

  const userId = await getUserId(request);
  if (!userId) return Response.json({ error: "Missing user identity." }, { status: 401 });

  const query = new URLSearchParams({
    select: "id,filename,mime_type,size_bytes,status,created_at",
    user_id: `eq.${userId}`,
    order: "created_at.desc"
  });

  const result = await supabaseRest<DocumentRow[]>(`documents?${query.toString()}`);
  if (result.error) return Response.json({ error: result.error }, { status: result.status });
  return Response.json({ documents: result.data || [] });
}

export async function POST(request: Request) {
  if (!isSupabaseConfigured()) return unavailable();

  const userId = await getUserId(request);
  if (!userId) return Response.json({ error: "Missing user identity." }, { status: 401 });

  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) return Response.json({ error: "Missing file." }, { status: 400 });

  if (file.size > maxUploadBytes) {
    return Response.json({ error: `File exceeds upload limit of ${maxUploadBytes} bytes.` }, { status: 413 });
  }

  const text = await textFromFile(file);
  const chunks = chunkText(text).slice(0, maxChunksPerDocument);
  const status = chunks.length ? "indexed" : "needs_parser";

  const documentResult = await supabaseRest<DocumentRow[]>("documents", {
    method: "POST",
    body: JSON.stringify({
      user_id: userId,
      filename: file.name,
      mime_type: file.type || "application/octet-stream",
      size_bytes: file.size,
      status
    })
  });

  if (documentResult.error || !documentResult.data?.[0]) {
    return Response.json({ error: documentResult.error || "Could not create document." }, { status: documentResult.status });
  }

  const document = documentResult.data[0];
  const rows = await Promise.all(
    chunks.map(async (chunk, index) => {
      const embedding = await createEmbedding(chunk.content);
      return {
        document_id: document.id,
        user_id: userId,
        chunk_index: index + 1,
        page_number: chunk.pageNumber,
        content: chunk.content,
        embedding: embedding ? embeddingToSqlVector(embedding) : null
      };
    })
  );

  if (rows.length) {
    const chunkResult = await supabaseRest<ChunkRow[]>("document_chunks", {
      method: "POST",
      body: JSON.stringify(rows)
    });

    if (chunkResult.error) return Response.json({ error: chunkResult.error }, { status: chunkResult.status });
  }

  return Response.json({ document, chunks: rows.length });
}
