-- ECO-lijstjes (taken, boodschappen, notities…) en timers/herinneringen. Idempotent.
create table if not exists public.ai_items (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  lijst text not null default 'taken' check (char_length(lijst) between 1 and 60),
  tekst text not null check (char_length(tekst) between 1 and 500),
  klaar boolean not null default false,
  created_at timestamptz not null default now(),
  klaar_at timestamptz
);
create index if not exists ai_items_user_idx on public.ai_items(user_id, klaar, lijst, created_at);
alter table public.ai_items enable row level security;
-- Gebruiker ziet en wijzigt alleen eigen lijstjes (LIJSTJES-paneel); de Edge Function schrijft met service role.
drop policy if exists "eigen lijstjes" on public.ai_items;
create policy "eigen lijstjes" on public.ai_items
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists public.ai_timers (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  label text not null default '' check (char_length(label) <= 200),
  soort text not null default 'timer' check (soort in ('timer', 'herinnering')),
  eind timestamptz not null,
  duur_sec integer,
  status text not null default 'loopt' check (status in ('loopt', 'klaar', 'gestopt')),
  created_at timestamptz not null default now()
);
create index if not exists ai_timers_due_idx on public.ai_timers(user_id, status, eind);
alter table public.ai_timers enable row level security;
drop policy if exists "eigen timers" on public.ai_timers;
create policy "eigen timers" on public.ai_timers
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
