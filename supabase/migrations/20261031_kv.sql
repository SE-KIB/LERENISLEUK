-- ECO-sleutelwaardes voor de server (bv. de Brightspace-sessie en de koppelstatus). Idempotent.
-- Geen policies: alleen de Edge Function (service role) kan erbij; de browser niet.
create table if not exists public.ai_kv (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.ai_kv enable row level security;
