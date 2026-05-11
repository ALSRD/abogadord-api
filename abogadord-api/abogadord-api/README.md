# Abogado de RD — API Oficial
Consultas jurídicas, artículos legales y redacción de documentos procesales en tiempo real.

Proyecto institucional de César Augusto Saviñón Guzmán (ALSRD SRL).

## Endpoints

- `GET /api/codigo_procesal?articulo=59` → Devuelve artículo del CPP (Ley 76-02, ref. 10-15 y 361-22).
- `GET /api/codigo_penal?articulo=302` → Devuelve artículo del Código Penal.
- `POST /api/documento` (JSON: { "tipo": "...", "detalles": "..." }) → Genera escrito procesal.
- `GET /api/jurisprudencia?tema=xxxx` → Resultados de jurisprudencia (enlaces de referencia).
- `POST /api/admin_upsert` (Headers: x-api-key: <clave>) → Agrega/actualiza artículos en /data/*.json

## Configuración en Vercel
1. Suba este repo a GitHub y haga Deploy en Vercel.
2. (Opcional) Configure la variable de entorno `ADMIN_API_KEY` para el endpoint admin.
3. La especificación para ChatGPT Actions estará en: `/api/openapi` o el archivo raíz `openapi.json`.

## MVP web de chat

Se agregó un primer frontend funcional en `../../apps/web` con Next.js, TailwindCSS, Framer Motion, Markdown avanzado, historial persistente en navegador, persistencia opcional en Supabase, Supabase Auth por magic link, RAG documental inicial y un endpoint SSE (`/api/chat/stream`) preparado para transmitir respuestas desde OpenAI con `OPENAI_API_KEY`.

Para ejecutarlo:

```bash
cd ../../apps/web
cp .env.example .env.local
# edite .env.local con OPENAI_API_KEY
npm install
npm run dev
```

Si `OPENAI_API_KEY` no está configurada, el chat funciona en modo demo con streaming simulado para validar la experiencia visual. Si `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` no están configuradas, el historial usa `localStorage` como fallback. Para activar persistencia cloud, ejecute `apps/web/supabase/migrations/0001_chat_mvp.sql` en Supabase y configure esas variables solo del lado servidor. Para activar login por magic link, configure también `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Para activar RAG documental, ejecute además `apps/web/supabase/migrations/0002_rag_foundation.sql`; los embeddings usan `OPENAI_EMBEDDING_MODEL` o `text-embedding-3-small` por defecto. Puede controlar costos con `MAX_DOCUMENT_UPLOAD_BYTES` y `MAX_CHUNKS_PER_DOCUMENT`, ajustar calidad RAG con `RAG_CONTEXT_MAX_CHARS` y `RAG_MIN_CONFIDENCE`, activar reranking con `RERANK_PROVIDER`/`JINA_API_KEY`, aplicar `apps/web/supabase/migrations/0003_feedback_and_traces.sql` para feedback/trazas/analytics, revisar la cola de feedback negativo desde `/api/review-queue`, y medir retrieval/generación con `npm run eval:all`.

## Roadmap de plataforma IA

La propuesta de evolución hacia una plataforma de chat IA premium, con Next.js, streaming, memoria, RAG, subida de archivos, arquitectura multiagente y escalabilidad cloud-ready, está documentada en [`docs/plataforma-chat-ia.md`](docs/plataforma-chat-ia.md).

## Notas
- Los archivos en `data/` incluyen una base inicial. Agregue el resto de artículos con `/api/admin_upsert`.
- Este proyecto usa funciones serverless de Vercel (archivos en `/api`).

