-- ECO-lesplanning: uit Brightspace geïmporteerde planning per vak (leidend boven het schoolrooster). Idempotent.
create table if not exists public.ai_planning (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  vak text not null check (char_length(vak) between 1 and 120),
  datum date not null,
  start text check (start ~ '^\d{2}:\d{2}$'),
  eind text check (eind ~ '^\d{2}:\d{2}$'),
  titel text not null check (char_length(titel) between 1 and 300),
  soort text,
  opmerking text,
  created_at timestamptz not null default now()
);
create index if not exists ai_planning_user_datum_idx on public.ai_planning(user_id, datum);
alter table public.ai_planning enable row level security;
-- Gebruiker ziet en wist alleen eigen planning; de Edge Function schrijft met service role.
drop policy if exists "eigen planning" on public.ai_planning;
create policy "eigen planning" on public.ai_planning
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
