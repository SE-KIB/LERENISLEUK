-- ECO-geheugen: blijvende feiten over de gebruiker. Idempotent.
create table if not exists public.ai_memory (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  fact text not null check (char_length(fact) between 1 and 500),
  created_at timestamptz not null default now()
);
create index if not exists ai_memory_user_idx on public.ai_memory(user_id, created_at desc);
alter table public.ai_memory enable row level security;
-- Gebruiker ziet, wijzigt en wist alleen eigen feiten (PROFIEL-paneel); de Edge Function schrijft met service role.
drop policy if exists "eigen geheugen" on public.ai_memory;
create policy "eigen geheugen" on public.ai_memory
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
