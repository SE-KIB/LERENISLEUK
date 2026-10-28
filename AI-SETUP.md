# Sekibar AI — opzet en installatie

## Hoe het werkt
```
Browser (index.html + ai.js, GitHub Pages)
   │  inloggen via Supabase Auth
   ▼
Supabase Edge Function `ai-chat`  ── controleert login, daglimiet, slaat gesprek op
   │  geheime API-sleutel (alleen op de server)
   ▼
Taalmodel (Anthropic Claude API)
```
De "eigen AI" is een eigen assistent: eigen website, eigen accounts, eigen gespreksgeschiedenis,
eigen instructies (systeemprompt) en eigen limieten, bovenop een bestaand taalmodel. Zelf een model
van nul trainen kost miljoenen en is niet nodig; het model is later te wisselen via `AI_MODEL`.

## Bestanden
- `index.html`, `ai.js`, `ai.css` — de chatwebsite
- `supabase/functions/ai-chat/index.ts` — server-functie die het model aanroept (streaming)
- `supabase/migrations/20261028_ai.sql` — tabellen `ai_conversations`, `ai_messages`, `ai_usage` met RLS
- `archief/lerenisleuk/` — de oude site; terug met `scripts/switch-site.sh lerenisleuk`

## Eenmalig instellen
1. API-sleutel aanmaken op https://console.anthropic.com (met betaalmethode en een uitgavelimiet).
2. Database: plak `supabase/migrations/20261028_ai.sql` in Supabase → SQL Editor → Run.
3. Secrets en functie uitrollen:
   ```bash
   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
   supabase functions deploy ai-chat
   ```
   Optioneel: `AI_MODEL`, `AI_DAILY_LIMIT` (standaard 50), `AI_SYSTEM_PROMPT`, `ALLOWED_ORIGIN`.
4. Supabase → Authentication → Providers: e-mail aan; URL Configuration → Site URL `https://sekibar.nl`.
5. Branch samenvoegen in `main` → GitHub Pages zet het live.

## Volgende stappen (ideeën)
- Kennis toevoegen (RAG): eigen documenten in Supabase (pgvector) en relevante stukken meesturen.
- Tools: de AI laten zoeken, rekenen of acties uitvoeren.
- Beheer: overzicht van gebruik/kosten per gebruiker uit `ai_usage`.
- Bestanden/afbeeldingen uploaden, spraak.
