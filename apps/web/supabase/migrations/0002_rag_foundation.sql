create extension if not exists vector;

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  filename text not null,
  mime_type text not null,
  size_bytes bigint not null,
  status text not null default 'indexed',
  created_at timestamptz not null default now()
);

create table if not exists public.document_chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  user_id uuid not null,
  chunk_index integer not null,
  page_number integer,
  content text not null,
  embedding vector(1536),
  created_at timestamptz not null default now()
);

alter table public.messages
  add column if not exists citations jsonb not null default '[]';

create index if not exists documents_user_created_idx
  on public.documents (user_id, created_at desc);

create index if not exists document_chunks_document_idx
  on public.document_chunks (document_id, chunk_index asc);

create index if not exists document_chunks_user_idx
  on public.document_chunks (user_id);

create index if not exists document_chunks_embedding_hnsw_idx
  on public.document_chunks using hnsw (embedding vector_cosine_ops);

alter table public.documents enable row level security;
alter table public.document_chunks enable row level security;

-- MVP note: route handlers use SUPABASE_SERVICE_ROLE_KEY server-side, which bypasses RLS.
-- Keep document access behind authenticated route handlers until direct auth.uid() policies are added.
