create table if not exists public.message_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  conversation_id uuid,
  message_id uuid,
  rating text not null check (rating in ('useful', 'incorrect', 'bad_source')),
  note text,
  citations jsonb not null default '[]',
  created_at timestamptz not null default now()
);

create table if not exists public.retrieval_traces (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  query text not null,
  candidate_count integer not null default 0,
  packed_count integer not null default 0,
  has_evidence boolean not null default false,
  top_score numeric not null default 0,
  top_rerank_score numeric not null default 0,
  reranker text,
  citations jsonb not null default '[]',
  created_at timestamptz not null default now()
);

create index if not exists message_feedback_user_created_idx
  on public.message_feedback (user_id, created_at desc);

create index if not exists retrieval_traces_user_created_idx
  on public.retrieval_traces (user_id, created_at desc);

alter table public.message_feedback enable row level security;
alter table public.retrieval_traces enable row level security;

-- MVP note: route handlers use SUPABASE_SERVICE_ROLE_KEY server-side, which bypasses RLS.
-- Keep feedback/traces behind authenticated route handlers until direct auth.uid() policies are added.
