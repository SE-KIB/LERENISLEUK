# ECO — persoonlijke assistent (secrets heten nog JARVIS_…; dat is zo bedoeld): opzet en installatie

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
- `archief/lerenisleuk/` — de oude site; terug met `scripts/switch-si## Automatisch uitrollen (aanbevolen)
De workflow `.github/workflows/deploy-function.yml` zet de functie zelf online bij elke wijziging op `main`.
Eenmalig, kan ook op de telefoon:
1. Supabase → klik op je profiel (rechtsboven) → **Account preferences** → **Access Tokens** → **Generate new token**
   (naam: `github-eco`) → kopieer de token.
2. GitHub → repository **LERENISLEUK** → **Settings** → **Secrets and variables** → **Actions** →
   **New repository secret** → Name `SUPABASE_ACCESS_TOKEN`, Secret = de token → **Add secret**.
3. GitHub → **Actions** → *ECO-functie uitrollen naar Supabase* → **Run workflow** (eerste keer met de hand).

## Snelste model: Groq (aanbevolen)
1. Ga naar https://console.groq.com → inloggen (bv. met Google) → **API Keys** → **Create API Key** → kopieer.
2. Supabase → Edge Functions → Secrets → `GROQ_API_KEY` = de sleutel → Save.
Klaar: ECO gebruikt dan eerst Groq en valt bij een storing terug op Gemini. Ander Groq-model kiezen kan met
`GROQ_MODEL` (komma-gescheiden, eerste die werkt wordt gebruikt).

## Spraakherkenning (Whisper via Groq)
Met `GROQ_API_KEY` neemt de microfoonknop je stem op en laat die uitschrijven door `whisper-large-v3`
(reserve: `whisper-large-v3-turbo`; instelbaar met `STT_MODEL`, taal met `STT_LANGUAGE`, standaard `nl`).
Opnemen stopt vanzelf na ~1,3 s stilte. Zonder Groq-sleutel gebruikt ECO de spraakherkenning van de browser.

## Apple-agenda (iCloud)
1. https://account.apple.com → Inloggen en beveiliging → App-specifieke wachtwoorden → **+** → naam `ECO` → kopieer.
2. Supabase-secrets: `ICLOUD_EMAIL` (Apple ID) en `ICLOUD_APP_PASSWORD` (het wachtwoord). Optioneel `ICLOUD_CALENDAR`
   = naam van de agenda waarin nieuwe afspraken komen (standaard de eerste gewone agenda).
ECO leest dan alle iCloud-agenda's (en Google als die ook gekoppeld is) en zet nieuwe afspraken in iCloud.

## Welk AI-model?
ECO werkt met **Google Gemini** (standaard zodra `GEMINI_API_KEY` bestaat) of **Claude** (`ANTHROPIC_API_KEY`).
Wisselen: secret `AI_PROVIDER` = `gemini` of `anthropic`; ander model kiezen met `AI_MODEL`
(standaard `gemini-flash-latest` of `claude-sonnet-5-5`).

**Gemini-sleutel (gratis laag):** https://aistudio.google.com → *Get API key* → *Create API key* →
in Supabase als secret `GEMINI_API_KEY`. Let op: in de gratis laag mag Google je gesprekken gebruiken
om modellen te verbeteren; met facturering aan (betaalde laag) niet. Een Gemini Pro-abonnement geeft geen API-tegoed.

## Eenmalig instellen
1. **Anthropic:** API-sleutel op https://console.anthropic.com (betaalmethode + uitgavelimiet instellen).
2. **Database:** plak `supabase/migrations/20261028_ai.sql` in Supabase → SQL Editor → Run.
3. **Jouw account:** Supabase → Authentication → Users → *Add user* (je e-mail + wachtwoord).
   Zet daarna Authentication → Providers → Email → *Allow new users to sign up* **uit**.
   Kopieer je User UID (nodig voor Siri).
4. **Google Agenda koppelen:**
   - https://console.cloud.google.com → nieuw project → *Google Calendar API* én *Gmail API* inschakelen.
   - OAuth-toestemmingsscherm: type *External*, jezelf als testgebruiker toevoegen, en daarna
     **"Publish app"** (anders verloopt de koppeling na 7 dagen).
   - Credentials → OAuth client ID → type *Web application*, redirect-URI
     `https://developers.google.com/oauthplayground`.
   - Ga naar https://developers.google.com/oauthplayground → tandwiel → *Use your own OAuth credentials* →
     vul client-ID/secret in → scopes (spatie-gescheiden) `https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.compose` → Authorize →
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

## "Hé Siri, Eco" op de iPhone
Opdrachten-app → nieuwe opdracht, naam **Eco**:
1. *Dicteer tekst* (taal Nederlands).
2. *Haal inhoud op van URL*: `https://wlpfgbrvnzjclnjocewj.supabase.co/functions/v1/smooth-service`
   — methode **POST**; headers `x-jarvis-key` = je JARVIS_KEY, `Content-Type` = `application/json`;
   verzoekhoofdtekst JSON met veld `message` = *Gedicteerde tekst*.
3. *Haal woordenboekwaarde op* → sleutel `reply` → *Spreek tekst uit*.
4. *Haal woordenboekwaarde op* → sleutel `open`; *Als* die *een waarde heeft* → *Open URL's*.
   (Hiermee opent "Hé Siri, Eco, route naar Utrecht Centraal" meteen Google Maps.)

Nu werkt "Hé Siri, Eco" → je vraag inspreken → ECO antwoordt hardop. Gesprekken zie je terug op sekibar.nl.

## ECO als app op je telefoon
iPhone: open sekibar.nl in **Safari** → deelknop → **Zet op beginscherm**. Android: Chrome → ⋮ → *App installeren*.
Hij opent dan schermvullend als eigen app met ECO-icoon; je blijft ingelogd.
Bij de eerste keer 🎙️ vraagt de telefoon toestemming voor de microfoon.

## Wat ECO mag zien
| Bron | Hoe | Kan ECO |
|---|---|---|
| Google Agenda | Google-koppeling (hierboven) | afspraken bekijken en maken |
| Gmail | Google-koppeling (hierboven) | zoeken, lezen, **concepten** maken (versturen doe je zelf) |
| Google Maps | geen koppeling nodig | route openen vanaf je locatie ("route naar …") |
| iPhone zelf (Herinneringen, Agenda van iCloud, Contacten, locatie) | iPhone-opdracht stuurt die gegevens mee | erover antwoorden |

Een website of app-snelkoppeling kan zelf **niet** in je iCloud of telefoon kijken; dat staat Apple niet toe.
De route via de Opdrachten-app wel: die vraagt jou eenmalig toestemming en geeft de gegevens door.
Voorbeeld "Hé Siri, Eco" met je agenda en herinneringen erbij: voeg vóór stap 2 toe
*Zoek agenda-activiteiten* (vandaag) en *Zoek herinneringen* (niet voltooid), en zet in het `message`-veld:
`Mijn agenda vandaag: [Agenda-activiteiten] — Open herinneringen: [Herinneringen] — Vraag: [Gedicteerde tekst]`.

## Natuurlijke stem (ElevenLabs)
1. Account op https://elevenlabs.io (gratis laag: beperkt aantal tekens per maand).
2. *Voices* → *Voice Library*: kies een stem, bv. zoeken op "british butler", "calm narrator", "AI assistant".
   Klik *Add to my voices* en kopieer de **Voice ID**.
3. *Profile → API keys* → nieuwe sleutel.
4. Supabase-secrets: `ELEVENLABS_API_KEY` en `ELEVENLABS_VOICE_ID`. Optioneel `ELEVENLABS_MODEL`
   (standaard `eleven_multilingual_v2`, spreekt ook Nederlands).
5. Nieuwe code van de functie plakken en deployen. Zonder deze secrets valt ECO terug op de browserstem.

Let op: de echte stem van Paul Bettany (JARVIS) klonen mag niet; ElevenLabs verbiedt het klonen van
iemands stem zonder toestemming. Kies een vergelijkbare stem uit de bibliotheek.

## Op de website
- 🎙️-knop of **spatie ingedrukt houden** om te praten; antwoorden worden voorgelezen (uit te zetten).
- Spraakherkenning werkt in Chrome, Edge en Safari.

## Volgende stappen (ideeën)
- Meer tools: weer, lampen/thermostaat (Home Assistant), notities, iCloud-agenda rechtstreeks (CalDAV met app-specifiek wachtwoord).
- Geheugen: vaste feiten over jou die ECO onthoudt.
- Betere stem: een TTS-dienst (bv. ElevenLabs) voor een echte ECO-stem.
- Wake-word ("Eco") op een altijd-aan apparaat, bv. een Raspberry Pi.
