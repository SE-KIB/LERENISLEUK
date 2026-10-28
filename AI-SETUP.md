# JARVIS — persoonlijke assistent: opzet en installatie

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
- `archief/lerenisleuk/` — de oude site; terug met `scripts/switch-si## Eenmalig instellen
1. **Anthropic:** API-sleutel op https://console.anthropic.com (betaalmethode + uitgavelimiet instellen).
2. **Database:** plak `supabase/migrations/20261028_ai.sql` in Supabase → SQL Editor → Run.
3. **Jouw account:** Supabase → Authentication → Users → *Add user* (je e-mail + wachtwoord).
   Zet daarna Authentication → Providers → Email → *Allow new users to sign up* **uit**.
   Kopieer je User UID (nodig voor Siri).
4. **Google Agenda koppelen:**
   - https://console.cloud.google.com → nieuw project → *Google Calendar API* inschakelen.
   - OAuth-toestemmingsscherm: type *External*, jezelf als testgebruiker toevoegen, en daarna
     **"Publish app"** (anders verloopt de koppeling na 7 dagen).
   - Credentials → OAuth client ID → type *Web application*, redirect-URI
     `https://developers.google.com/oauthplayground`.
   - Ga naar https://developers.google.com/oauthplayground → tandwiel → *Use your own OAuth credentials* →
     vul client-ID/secret in → scope `https://www.googleapis.com/auth/calendar.events` → Authorize →
     *Exchange authorization code for tokens* → kopieer de **refresh token**.
5. **Secrets zetten en uitrollen** (`JARVIS_KEY` = zelfverzonnen lange geheime tekst):
   ```bash
   supabase secrets set ANTHROPIC_API_KEY=sk-ant-... ALLOWED_EMAILS=jij@voorbeeld.nl JARVIS_KEY=lang-geheim JARVIS_USER_ID=jouw-uid GOOGLE_CLIENT_ID=... GOOGLE_CLIENT_SECRET=... GOOGLE_REFRESH_TOKEN=...
   ```
   ```bash
   supabase functions deploy ai-chat --no-verify-jwt
   ```
   (`--no-verify-jwt` is nodig voor de Siri-sleutel; de functie controleert zelf de toegang.)
6. **Live zetten:** branch samenvoegen in `main` → GitHub Pages.

## "Hé Siri, Jarvis" op de iPhone
Opdrachten-app → nieuwe opdracht, naam **Jarvis**:
1. *Dicteer tekst* (taal Nederlands).
2. *Haal inhoud op van URL*: `https://wlpfgbrvnzjclnjocewj.supabase.co/functions/v1/ai-chat`
   — methode **POST**; headers `x-jarvis-key` = je JARVIS_KEY, `Content-Type` = `application/json`;
   verzoekhoofdtekst JSON met veld `message` = *Gedicteerde tekst*.
3. *Haal woordenboekwaarde op* → sleutel `reply`.
4. *Spreek tekst uit* → *Woordenboekwaarde*.

Nu werkt "Hé Siri, Jarvis" → je vraag inspreken → JARVIS antwoordt hardop. Gesprekken zie je terug op sekibar.nl.

## Op de website
- 🎙️-knop of **spatie ingedrukt houden** om te praten; antwoorden worden voorgelezen (uit te zetten).
- Spraakherkenning werkt in Chrome, Edge en Safari.

## Volgende stappen (ideeën)
- Meer tools: herinneringen, weer, e-mail (Gmail), lampen/thermostaat (Home Assistant), notities.
- Geheugen: vaste feiten over jou die JARVIS onthoudt.
- Betere stem: een TTS-dienst (bv. ElevenLabs) voor een echte JARVIS-stem.
- Wake-word ("Jarvis") op een altijd-aan apparaat, bv. een Raspberry Pi.
