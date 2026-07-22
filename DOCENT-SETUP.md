# Docenten-dashboard activeren (Supabase — 100% gratis)

De site werkt nu al in **lokale modus** (voortgang op het eigen apparaat). Volg
deze stappen één keer om de **centrale database** en het **docenten-dashboard**
aan te zetten. Dan ziet de docent elke leerling — vanaf elk apparaat — tot op
vraagniveau, en reist de voortgang mee tussen telefoons/computers.

> Tijd: ± 15 minuten. Je hebt geen technische kennis nodig; alles is kopiëren en plakken.

---

## Stap 1 — Maak een gratis Supabase-project
1. Ga naar <https://supabase.com> → **Start your project** → maak een gratis account.
2. Klik **New project**. Kies een naam (bijv. `lerenisleuk`), een sterk
   database-wachtwoord (bewaren!) en een regio (bijv. *Frankfurt / EU*).
3. Wacht ~1 minuut tot het project klaar is.

## Stap 2 — Zet de database in elkaar
1. Open in je project links **SQL Editor** → **New query**.
2. Plak onderstaande SQL en klik **Run**. (Je mag alles in één keer draaien.)

```sql
-- Profiles: rol per gebruiker (student of teacher)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  role text not null default 'student'
);

-- Antwoorden: één rij per leerling per vraag (nieuwste telt)
create table if not exists public.answers (
  user_id uuid not null references auth.users(id) on delete cascade,
  email text,
  lesson text not null,
  q_index int not null,
  correct boolean not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, lesson, q_index)
);

-- Pogingen: één rij per volledige oefensessie (geschiedenis, met per-vraag detail)
create table if not exists public.attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  email text,
  lesson text not null,
  mode text,
  score int not null default 0,
  total int not null default 0,
  pct int not null default 0,
  details jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists attempts_user_lesson_idx on public.attempts (user_id, lesson, created_at desc);

-- Lessen vrijgeven: welke lessen mogen leerlingen zien? (docent bepaalt)
create table if not exists public.lesson_settings (
  lesson text primary key,
  released boolean not null default true,
  updated_at timestamptz not null default now()
);

-- Nieuw account -> automatisch een profiles-rij
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name',''))
  on conflict (id) do nothing;
  return new;
end;$$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users for each row execute function public.handle_new_user();

-- Helper: is de ingelogde gebruiker docent?
create or replace function public.is_teacher()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'teacher');
$$;

-- Beveiliging aanzetten (Row Level Security)
alter table public.profiles enable row level security;
alter table public.answers  enable row level security;
alter table public.attempts enable row level security;
alter table public.lesson_settings enable row level security;

-- Lessen vrijgeven: iedereen mag lezen welke lessen vrij zijn, alleen de docent wijzigt
drop policy if exists ls_sel on public.lesson_settings;
create policy ls_sel on public.lesson_settings for select using (true);
drop policy if exists ls_ins on public.lesson_settings;
create policy ls_ins on public.lesson_settings for insert with check (public.is_teacher());
drop policy if exists ls_upd on public.lesson_settings;
create policy ls_upd on public.lesson_settings for update
  using (public.is_teacher()) with check (public.is_teacher());

drop policy if exists p_sel on public.profiles;
create policy p_sel on public.profiles for select
  using (id = auth.uid() or public.is_teacher());

drop policy if exists a_sel on public.answers;
create policy a_sel on public.answers for select
  using (user_id = auth.uid() or public.is_teacher());
drop policy if exists a_ins on public.answers;
create policy a_ins on public.answers for insert with check (user_id = auth.uid());
drop policy if exists a_upd on public.answers;
create policy a_upd on public.answers for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists at_sel on public.attempts;
create policy at_sel on public.attempts for select
  using (user_id = auth.uid() or public.is_teacher());
drop policy if exists at_ins on public.attempts;
create policy at_ins on public.attempts for insert with check (user_id = auth.uid());

-- Docent mag voortgang wissen (leerling opnieuw laten maken)
drop policy if exists a_del on public.answers;
create policy a_del on public.answers for delete
  using (user_id = auth.uid() or public.is_teacher());
drop policy if exists at_del on public.attempts;
create policy at_del on public.attempts for delete
  using (user_id = auth.uid() or public.is_teacher());
```

> **Al een database van vóór deze update?** Draai alleen de nieuwe blokken
> opnieuw; de rest is ongewijzigd. Bestaande gegevens blijven behouden:
> - *Pogingen* (eerdere update): de `attempts`-tabel, het bijbehorende
>   `alter table … enable row level security`, en de `at_*`- en `a_del`-policies.
> - *Lessen vrijgeven* (deze update): de tabel `lesson_settings`, het
>   `alter table public.lesson_settings enable row level security`, en de
>   `ls_sel`/`ls_ins`/`ls_upd`-policies.

## Stap 3 — Maak de accounts aan
1. Ga links naar **Authentication** → **Users** → **Add user** → **Create new user**.
2. Vul e-mail + wachtwoord in en zet **Auto Confirm User** AAN (belangrijk!).
   - De e-mails hoeven geen echte mailboxen te zijn; ze dienen als inlognaam.
3. Maak zo je accounts, bijvoorbeeld:
   - `s@e.nl` (de docent)
   - `o@k.nl`, … (de leerlingen)

## Stap 4 — Maak de docent 'teacher'
Open **SQL Editor** opnieuw en run (pas het e-mailadres aan als nodig):

```sql
update public.profiles set role = 'teacher' where email = 's@e.nl';
```

Namen tonen in het dashboard? Zet ze zo (optioneel):
```sql
update public.profiles set full_name = 'Serkan' where email = 's@e.nl';
update public.profiles set full_name = 'Ozcan'  where email = 'o@k.nl';
```

## Stap 5 — Verbind de website met de database
1. Ga in Supabase naar **Project Settings** (tandwiel) → **API**.
2. Kopieer twee dingen:
   - **Project URL** (bijv. `https://abcd1234.supabase.co`)
   - **anon public** sleutel (lange tekst — de *anon*, niet de *service_role*!)
3. Open in dit project het bestand **`index.html`** en vul bovenaan in:

```js
const SUPABASE_URL = "https://abcd1234.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOi...jouw-anon-sleutel...";
```

4. Sla op en commit (of laat Claude het voor je doen). Klaar!

---

## Wat werkt er daarna
- **Leerlingen** loggen in met hun Supabase-account; elk antwoord wordt centraal
  opgeslagen. Voortgang reist mee tussen apparaten.
- **De docent** (`role = teacher`) krijgt automatisch het **docenten-dashboard**.
  Je begint bij een overzicht van alle **lessen**; klik een les en je ziet een
  tabel met alle leerlingen × alle vragen (laatste resultaat per vraag). Klik een
  leerling en je ziet **de meest recente poging** plus een **lijst met álle
  pogingen** — elke poging is aanklikbaar om te zien wat de leerling toen precies
  invoerde en behaalde (goed / fout, per vraag). Met de knop **Voortgang wissen**
  op de leerling-pagina kun je, indien nodig, de voortgang van die leerling voor
  díe les verwijderen zodat hij de les opnieuw kan maken.
- **Lessen vrijgeven.** Bovenaan het docenten-dashboard staat het paneel
  **"Lessen vrijgeven"** met per les een schakelaar. Zet een les op *Verborgen*
  en leerlingen zien die les niet meer — handig om rustig een nieuwe les te
  ontwerpen zonder dat leerlingen een halve module te zien krijgen. Zet hem op
  *Vrijgegeven* zodra hij klaar is. Jij als docent ziet verborgen lessen zelf
  wél staan (met een 🔒 en de tekst "alleen voor jou zichtbaar") zodat je ze kunt
  testen via **↔ Naar leerlingscherm**. Lessen zonder eigen instelling staan
  standaard op vrijgegeven, dus bestaande lessen blijven gewoon zichtbaar.

## Veilig?
Ja. De *anon*-sleutel mag publiek in de website staan — de beveiliging zit in de
database-regels (RLS): leerlingen zien alleen hun eigen gegevens, alleen de
docent ziet alles. Gebruik nooit de *service_role*-sleutel in de website.

## Nieuwe leerling toevoegen (later)
Authentication → Users → Add user (met Auto Confirm). Meer niet — bij de eerste
oefening verschijnt de leerling vanzelf in het docenten-dashboard.
