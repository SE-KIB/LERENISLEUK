-- ECO-contacten voor WhatsApp (naam + nummer). Idempotent.
create table if not exists public.ai_contacts (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  naam text not null check (char_length(naam) between 1 and 80),
  telefoon text not null check (telefoon ~ '^[0-9]{8,15}$'),
  created_at timestamptz not null default now()
);
create unique index if not exists ai_contacts_user_naam on public.ai_contacts(user_id, lower(naam));
alter table public.ai_contacts enable row level security;
drop policy if exists "eigen contacten" on public.ai_contacts;
create policy "eigen contacten" on public.ai_contacts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
