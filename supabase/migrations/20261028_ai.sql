-- Eigen AI: gesprekken, berichten en dagelijks gebruik per gebruiker.
create table if not exists public.ai_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'Nieuw gesprek',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.ai_messages (
  id bigint generated always as identity primary key,
  conversation_id uuid not null references public.ai_conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user','assistant')),
  content text not null,
  created_at timestamptz not null default now()
);
create index if not exists ai_messages_conv_idx on public.ai_messages(conversation_id, id);
create table if not exists public.ai_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null default current_date,
  requests int not null default 0,
  input_tokens int not null default 0,
  output_tokens int not null default 0,
  primary key (user_id, day)
);

alter table public.ai_conversations enable row level security;
alter table public.ai_messages enable row level security;
alter table public.ai_usage enable row level security;

-- Gebruikers zien en beheren alleen hun eigen gesprekken.
create policy "eigen gesprekken" on public.ai_conversations
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
-- Berichten lezen/verwijderen mag; schrijven gebeurt alleen via de Edge Function (service role).
create policy "eigen berichten lezen" on public.ai_messages
  for select using (auth.uid() = user_id);
create policy "eigen gebruik lezen" on public.ai_usage
  for select using (auth.uid() = user_id);
