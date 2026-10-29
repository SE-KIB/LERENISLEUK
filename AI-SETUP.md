# ECO — persoonlijke assistent (secrets heten nog JARVIS_…; dat is zo bedoeld): opzet en installatie

## Hoe het werkt
```
Browser (index.html + ai.js, GitHub Pages)
   │  inloggen via Supabase Auth
   ▼
Supabase Edge Function `ai-chat`  ── controleert login, daglimiet, slaat gesprek op
   │  geheime API-sleutel (alleen op de server)
   ▼
Taalmodel: Groq voor gewone vragen, Gemini voor denkwerk en foto's (allebei gratis)
```
**Helemaal gratis.** ECO draait op gratis lagen: GitHub Pages (website), Supabase (database + server-functie),
Groq (snel taalmodel + spraakherkenning) en Gemini (slim taalmodel, stem, webzoeken, foto's). Je hebt alleen twee
gratis sleutels nodig: `GROQ_API_KEY` en `GEMINI_API_KEY`. Een betaald model (Claude) kan erbij, maar hoeft niet.
De "eigen AI" is een eigen assistent: eigen website, eigen accounts, eigen gespreksgeschiedenis,
eigen instructies (systeemprompt) en eigen limieten, bovenop een bestaand taalmodel. Zelf een model
van nul trainen kost miljoenen en is niet nodig; het model is later te wisselen via `AI_MODEL`.

## Bestanden
- `index.html`, `ai.js`, `ai.css` — de chatwebsite
- `supabase/functions/ai-chat/index.ts` — server-functie die het model aanroept (streaming)
- `supabase/migrations/20261028_ai.sql` — tabellen `ai_conversations`, `ai_messages`, `ai_usage` met RLS
- `supabase/migrations/20261029_memory.sql`, `20261030_planning.sql`, `20261031_kv.sql` — geheugen, lesplanning en server-opslag (draaien automatisch)
- `supabase/migrations/20261101_cron.sql` — ECO-klok: de database roept de functie elke 30 seconden aan (timers, ochtendbriefing)
- `supabase/migrations/20261102_lijstjes.sql` — tabellen `ai_items` (lijstjes) en `ai_timers` met RLS
- `supabase/migrations/20261103_contacten.sql` — tabel `ai_contacts` (WhatsApp-contacten) met RLS
- `supabase/migrations/20261104_zoeken.sql` — zoekindex (Nederlands) op alle berichten, voor het archief
- `eco-sw.js` — service worker, alleen voor pushmeldingen (geen offline-cache)
- `scripts/brightspace/sync.mjs` + `.github/workflows/brightspace-sync.yml` — Brightspace-roosterpagina's elke ochtend ophalen
- `widget/eco-widget.js` + `widget/installeer.js` — iPhone-widget voor Scriptable
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
Whisper krijgt een woordenlijst mee met je vaknamen uit het rooster, zodat hij die goed verstaat. Twijfelt hij (lage zekerheid,
of hij herhaalt zichzelf), dan vraagt ECO om het nog eens te zeggen in plaats van te gokken; drempel instelbaar met `STT_MIN_LOGPROB`
(standaard -0.7). Tik op je eigen bericht in het transcript om een verkeerd verstane zin te verbeteren.
Opnemen stopt vanzelf na ~1,3 s stilte (na een lange zin 1,1 s). De opname gaat in **één verzoek** naar de server: uitschrijven,
nadenken en antwoorden gebeuren achter elkaar, zonder extra rondje via de browser. Zonder Groq-sleutel gebruikt ECO de spraakherkenning van de browser.

## Snelheid en stem (hoe ECO zo snel antwoordt)
- **Twee banen:** gewone vragen en snelle opdrachten (agenda, weer, lijstjes, timers, muziek) gaan naar Groq `gpt-oss-120b`
  (~500 tokens per seconde). Denkwerk ("waarom", "leg uit", "bereken", "vergelijk", huiswerk, plannen, vertalen, lange berichten)
  en foto's gaan naar de **slimme baan**: Gemini die eerst nadenkt (zie *Welk AI-model?*). Groq onthoudt het vaste begin van de prompt (promptcache).
  Een kleiner, nog sneller model voor korte vragen kan met secret `GROQ_FAST_MODEL` (bv. `openai/gpt-oss-20b`; standaard uit, want minder slim).
- **Streaming:** het antwoord komt woord voor woord binnen. De eerste zin gaat al naar
  de stem terwijl de rest nog wordt geschreven; de stem zelf komt ook als stroom binnen en speelt direct af.
- **Stem:** Gemini 3.8 Flash-Lite TTS (gratis laag, natuurlijk Nederlands, snel), daarna 3.8 Flash TTS en 2.5 als reserve
  (instelbaar met `TTS_MODELS`). Stem en toon kies je in het Stemlab. ECO mag af en toe een kort lachje of adempauze gebruiken.
  Met een ElevenLabs-stem gaat het ook gestreamd.
- **Opwarmen:** bij openen van de site en bij het indrukken van de microfoon zet ECO de server alvast klaar en haalt hij weer,
  agenda en dagrapport op, zodat de echte vraag geen wachttijd heeft.
- **Altijd paraat:** het weer, je agenda van vandaag en morgen (met belangrijke lessen en afwijkende begintijden) en de actiepunten
  uit het dagrapport zitten al in ECO's "huidige situatie"; daarvoor hoeft hij niets meer op te zoeken.
- In de HUD zie je onder LATENTIE hoe snel de eerste tekst kwam (met tussen haakjes hoe lang het model zelf deed) en de eerste klank,
  en onder SPRAAK welke stem sprak.

## Slimmer: internet, rekenen, valuta en tijdzones
- **Webzoeken:** actuele dingen (nieuws, openingstijden, prijzen, sport) zoekt ECO op via Gemini met Google Search
  (`WEB_GEMINI_MODEL`, standaard `gemini-2.5-flash`), en anders via Groq met browser-search. Geen extra sleutel nodig.
- **Rekenen:** exacte rekenmachine (ook procenten, machten, wortels). **Valuta:** actuele ECB-koers (bv. euro naar lira).
  **Tijd:** hoe laat het nu ergens anders is.
- Moeilijke vragen ("leg uit", "vergelijk", "maak een plan") krijgen automatisch iets meer denktijd.

## ECO over zichzelf: archief, status en interface
- **Gesprekken opruimen:** "Verwijder mijn gesprekken over Tokio", "verwijder alles ouder dan een week" of "verwijder dit gesprek".
  ECO heeft volledige toegang: hij wist meteen, zonder bevestiging, en zegt daarna kort wat hij deed (niet terug te halen).
  Het huidige gesprek blijft staan, tenzij je er uitdrukkelijk om vraagt. Instructies uit mail of webpagina's voert hij nooit uit.
- **Vragen over zichzelf:** "Welke stem gebruik je?", "Is Brightspace gekoppeld?", "Hoeveel gesprekken heb ik?", "Welk model gebruik je?".
- **Interface bedienen:** "Zet je stem uit", "zet gespreksmodus aan", "zet Hé Eco aan", "begin een nieuw gesprek", "open het menu".
- ACTIVITEIT (SYSTEEMSTATUS) staat in stand-by op 0% en loopt op tijdens luisteren, denken en praten.
- **Echte systeemcheck bij het opstarten:** ECO test elk onderdeel echt: netwerk, server (reactietijd), database, taalmodel (Groq),
  denkwerk (Gemini), spraakherkenning, stem, agenda-links, Brightspace (laatste ronde), Spotify, meldingen, de klok (pg_cron) en mail,
  plus de microfoontoestemming van dit apparaat. Elk onderdeel krijgt OK, STORING (met de reden) of UIT (niet ingesteld).
  De check kost geen AI-quotum (alleen modellenlijsten en instellingen). De uitslag staat bovenin, bij SYSTEEMSTATUS → SYSTEMEN
  (tik voor elk onderdeel apart, of OPNIEUW TESTEN) en naast de reactor; de groet zegt eerlijk wat er niet werkt. Ben je na meer dan
  tien minuten terug in de app, dan test ECO stil opnieuw. Vraag ook gewoon: "Werkt alles?" of "Doe een systeemcheck".

## Apple-agenda (iCloud)
1. https://account.apple.com → Inloggen en beveiliging → App-specifieke wachtwoorden → **+** → naam `ECO` → kopieer.
2. Supabase-secrets: `ICLOUD_EMAIL` (Apple ID) en `ICLOUD_APP_PASSWORD` (het wachtwoord). Optioneel `ICLOUD_CALENDAR`
   = naam van de agenda waarin nieuwe afspraken komen (standaard de eerste gewone agenda).
ECO leest dan alle iCloud-agenda's (en Google als die ook gekoppeld is) en zet nieuwe afspraken in iCloud.

## Agenda-links (schoolrooster e.d.)
Elk systeem dat een ICS/iCal-link geeft (MyTimetable, Zermelo, Magister, SOMtoday, Outlook "Agenda publiceren") kan erbij.
Supabase-secret `AGENDA_FEEDS` = `Naam|link`, meerdere gescheiden door komma's, bv. `School|https://…/ical?…`.
ECO leest deze agenda's mee (alleen-lezen; herhalingen worden uitgevouwen). Houd de link privé.

## Brightspace (lesplanning, opdrachten, deadlines)
1. Brightspace → **Agenda** (Calendar) → **Abonneren** (Subscribe) → kies *alle cursussen* → kopieer de link
   (iets als `https://brightspace.hhs.nl/d2l/le/calendar/feed/user/feed.ics?token=…`). Zie je geen *Abonneren*, dan
   heeft de school agenda-feeds uitgezet; dan kan het helaas niet.
2. Supabase-secret `AGENDA_FEEDS` aanvullen met een komma: `School|https://mytimetable…,Brightspace|https://…feed.ics?token=…`
   (de naam moet "Brightspace" bevatten, dan herkent ECO de items als opdrachten en deadlines).
ECO ziet daarna wat docenten in de Brightspace-agenda zetten. Lesplanning die alleen als document in een cursus staat,
kan ECO niet lezen: Brightspace zit achter je HHS-login met tweestapsverificatie, en je schoolwachtwoord in ECO bewaren
is onveilig. ECO noemt bij een lestijd altijd de bron ("volgens je schoolrooster"). **Brightspace is leidend:** docenten zetten wijzigingen
(later beginnen, verplaatst, vervalt) in Brightspace, terwijl MyTimetable vaak nog de oude planning toont. Noemt Brightspace een
andere tijd voor hetzelfde vak, dan geeft ECO die tijd en zegt hij dat het rooster iets anders zegt.

**Lesplanning van de docent (de "Rooster"-pagina in een Brightspace-cursus):** zo'n tabel per week staat niet in een agenda-link.
Maak er screenshots van (op de iPhone liefst in de breedte, of op de computer; een brede tabel mag in delen) of sla hem op als PDF,
en kies in ECO bij **ROOSTER → + PLANNING** de bestanden en het vak. Gemini leest alle weken uit, ook rode afwijkende tijden,
zelfstudie, toetsen en inleverdata. Die planning is daarna **leidend**: de roosterles van dat vak op die dag wordt doorgestreept.
Opnieuw uploaden vervangt alleen de dagen die op de nieuwe screenshots staan. Wissen kan met ✕ naast de vaknaam.

**Brightspace automatisch bijwerken (gratis):** elke ochtend om 06:20 opent GitHub Actions met Playwright je Rooster-pagina's
in Brightspace en zet ECO de planning bij (zelfde import als + PLANNING, maar alleen de komende 6 weken: dat gaat sneller en
betrouwbaarder). Gemini leest per vak eerst de tekst en dan elke screenshot apart; is Gemini even druk of is het gratis quotum van
een model op, dan probeert ECO het volgende model (`PLANNING_MODEL`, standaard `gemini-3.8-flash`, `gemini-3.6-flash`,
`gemini-2.5-flash`, `gemini-3.5-flash-lite`) en de robot probeert mislukte delen na een halve minuut nog één keer. Wat er
misging zie je kort per model bij BRIGHTSPACE (bv. "3.8-flash 429 quotum op"). Eenmalig instellen:
1. **Sleutel:** verzin een lange geheime tekst. Zet hem in Supabase als secret `JARVIS_KEY` én in GitHub → repository
   **LERENISLEUK** → Settings → Secrets and variables → Actions → **New repository secret** `JARVIS_KEY` (dezelfde waarde).
2. **Pagina's:** open in Brightspace de Rooster-pagina van een vak, kopieer het adres, en kies in ECO **ROOSTER → + PAGINA**.
3. **Sessie (één keer, op een computer):** installeer Node.js (nodejs.org) en typ in een terminal
   `npx playwright@1.63.0 codegen --save-storage=brightspace.json https://brightspace.hhs.nl`
   Log in het venster dat opent in (HHS + tweestapsverificatie, kies "Aangemeld blijven"), wacht tot je je Brightspace-startpagina
   ziet en sluit dan het browservenster. Upload het bestand `brightspace.json` in ECO met **ROOSTER → SESSIE UPLOADEN**.
4. Meteen proberen: GitHub → **Actions** → *Brightspace bijwerken* → **Run workflow**. Het resultaat zie je in ECO bij BRIGHTSPACE.
Verloopt de sessie, dan zegt ECO dat; herhaal dan stap 3. Je wachtwoord wordt nergens bewaard; de sessie staat alleen in je
eigen Supabase-database (niet in GitHub). De GitHub-logs zijn openbaar, maar tonen alleen aantallen. Stoppen: haal de pagina's weg
(✕) of meld je in je HHS/Microsoft-account overal af.
`JARVIS_USER_ID` hoeft niet meer: zonder die secret gebruikt ECO het account uit `ALLOWED_EMAILS`.

**Controleren wat ECO ziet:** het paneel **ROOSTER** (onder het transcript) toont per dag alle afspraken per bron. Houd je vinger
of muis op een les om de ruwe tijd uit de link te zien. Wijkt die af van Brightspace/MyTimetable, stuur dan een screenshot van beide.

Wat ECO met het rooster doet: bij elke les kijkt hij of het een **belangrijke** les is (toets, tentamen, presentatie,
deadline, verplicht), **zelfstudie**, of **vervalt**, en of de les **eerder of later** begint dan normaal (vergeleken met
dezelfde les op dezelfde weekdag in de weken eromheen). Ook per dag: "eerste les een uur later dan normaal" of
"geen les, terwijl er normaal wel les is".

## Dagrapport uit je mail
Elke ochtend rond half acht komt er een mail met onderwerp "Dagrapport" binnen. ECO leest het nieuwste rapport als je vraagt
naar je mail, het dagrapport of hoe je dag eruitziet.
- Is Google gekoppeld (zie hieronder), dan werkt het meteen.
- Anders: https://myaccount.google.com/apppasswords (tweestapsverificatie moet aan staan) → naam `ECO` → kopieer het
  wachtwoord. Supabase-secrets: `GMAIL_EMAIL` (je Gmail-adres) en `GMAIL_APP_PASSWORD`. ECO leest dan alleen-lezen via IMAP.
- Ander onderwerp? Secret `DAGRAPPORT_QUERY`, bv. `subject:Dagrapport from:me` (Gmail-zoektaal).

## Welk AI-model? (gratis)
- **Gewone vragen:** **Groq** `openai/gpt-oss-120b` (dan `gpt-oss-20b`; instelbaar met `GROQ_MODEL`). Razendsnel.
- **Denkwerk en foto's (slimme baan):** **Gemini 3.8 Flash** met denktijd "medium" (dan `gemini-3.6-flash` en `gemini-2.5-flash`;
  instelbaar met `SMART_MODEL`, leeg = uit). Veel slimmer dan gpt-oss, maar het eerste woord komt een paar seconden later
  (in beeld: *Nadenken…*). Wachttijd op het eerste woord: 30 seconden (`SMART_TIMEOUT_MS`). Lukt Gemini niet (bv. quotum op),
  dan antwoordt Groq met extra denktijd.
- **Diep nadenken:** valt een moeilijke vraag toch bij Groq (bv. een korte rekensom of redenering), dan kan Groq zelf de tool
  `diep_nadenken` gebruiken: Gemini werkt de vraag uit met veel denktijd, Groq vertelt het antwoord kort.
- **Reserve bij een Groq-storing:** Gemini (`gemini-flash-latest`, dan `AI_MODEL_FALLBACKS`) met een beetje denktijd, ook gestreamd.
  Elke Groq-aanroep heeft 10 seconden tot het eerste woord (`AI_TIMEOUT_MS`).
- Volgorde aan te passen met `AI_PROVIDERS` (bv. `groq,gemini,anthropic`). Claude (betaald) werkt ook als `ANTHROPIC_API_KEY` bestaat,
  maar is niet nodig. Vraag "welk model gebruik je?" en ECO vertelt welke baan antwoordde.

**Grenzen van de gratis lagen:** Groq ongeveer 30 vragen per minuut en 1000 per dag per model; Gemini ongeveer 10 per minuut,
het dagquotum per model zie je in AI Studio onder *Rate limit*. Voor één persoon is dat ruim genoeg; bij een storing of
op = op neemt het andere model het over.

**Gemini-sleutel (gratis laag):** https://aistudio.google.com → *Get API key* → *Create API key* →
in Supabase als secret `GEMINI_API_KEY`. Let op: in de gratis laag mag Google je gesprekken gebruiken
om modellen te verbeteren; met facturering aan (betaalde laag) niet. Een Gemini Pro-abonnement geeft geen API-tegoed.

## Eenmalig instellen
1. **AI-sleutels (gratis):** `GROQ_API_KEY` en `GEMINI_API_KEY` (zie hierboven). Claude via https://console.anthropic.com is optioneel en betaald.
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
   supabase secrets set GROQ_API_KEY=gsk_... GEMINI_API_KEY=... ALLOWED_EMAILS=jij@voorbeeld.nl JARVIS_KEY=lang-geheim JARVIS_USER_ID=jouw-uid GOOGLE_CLIENT_ID=... GOOGLE_CLIENT_SECRET=... GOOGLE_REFRESH_TOKEN=...
   ```
   ```bash
   supabase functions deploy ai-chat --no-verify-jwt
   ```
   (`--no-verify-jwt` is nodig voor de Siri-sleutel; de functie controleert zelf de toegang.)
6. **Live zetten:** branch samenvoegen in `main` → GitHub Pages.

## "Hé Siri, start Eco" en "Hé Eco": ECO openen en meteen luisteren
ECO opent dan op je iPhone, slaat het opstartscherm over en luistert direct (adres `https://sekibar.nl/#luister`).
1. **Opdracht maken:** Opdrachten-app → **+** → actie **URL** met `https://sekibar.nl/#luister` → actie **Open URL's** →
   noem de opdracht **Start Eco**. Nu werkt **"Hé Siri, start Eco"** (of "open Eco", als je hem zo noemt).
2. **"Hé Eco" zonder Siri (iOS 18 of nieuwer):** Instellingen → Toegankelijkheid → **Spraakopdrachten** (Engels: Vocal Shortcuts;
   blok *Spraak*, of zoek "Spraakopdrachten" in Instellingen) → Voeg handeling toe → bij *Opdrachten* kies **Start Eco** → zeg drie
   keer "Hé Eco". Daarna start "Hé Eco" de opdracht. Werkt het in het Nederlands niet, zet de iPhone-taal dan tijdelijk op Engels. Apple staat niet toe dat een
   website of app zelf op de achtergrond naar een eigen wekwoord luistert; via deze iOS-functie kan het wel.
3. **Microfoon zonder vragen:** Instellingen → Apps → Safari → **Microfoon** → *Sta toe* (of in Safari: aA → Website-instellingen
   → Microfoon → Sta toe). Vraagt iOS toch om een tik, dan verschijnt er een grote knop **TIK OM TE PRATEN**.

**"Hé Eco" in ECO zelf:** zet bij BEDIENING **HÉ ECO** aan. Zolang ECO open staat (bijvoorbeeld op je laptop) luistert hij naar
"Hé Eco" en daarna naar je vraag. Je mag ook alles in één keer zeggen: "Hé Eco, hoe laat begint water?". Hij luistert niet terwijl
hij zelf praat. Werkt in Chrome, Edge en Safari, met internet; op de iPhone alleen met het scherm aan en ECO open.

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
| Spotify | geen koppeling nodig / koppeling + Premium (hieronder) | muziek openen / volledig bedienen |
| WhatsApp | geen koppeling nodig | bericht klaarzetten (jij verstuurt); lezen kan niet |
| iPhone zelf (Herinneringen, Agenda van iCloud, Contacten, locatie) | iPhone-opdracht stuurt die gegevens mee | erover antwoorden |

Een website of app-snelkoppeling kan zelf **niet** in je iCloud of telefoon kijken; dat staat Apple niet toe.
De route via de Opdrachten-app wel: die vraagt jou eenmalig toestemming en geeft de gegevens door.
Voorbeeld "Hé Siri, Eco" met je agenda en herinneringen erbij: voeg vóór stap 2 toe
*Zoek agenda-activiteiten* (vandaag) en *Zoek herinneringen* (niet voltooid), en zet in het `message`-veld:
`Mijn agenda vandaag: [Agenda-activiteiten] — Open herinneringen: [Herinneringen] — Vraag: [Gedicteerde tekst]`.

## Ochtendbriefing met melding (gratis)
Elke ochtend (standaard **07:30**) maakt ECO je briefing: lessen en afspraken van vandaag (Brightspace-planning gaat voor het
rooster, met lessen die eerder of later beginnen), het weer met een tip en de actiepunten uit het dagrapport. Je krijgt een
melding *☀️ Je briefing staat klaar*; tik erop → ECO opent → tik op **☀️ TIK VOOR JE BRIEFING** en hij leest hem voor.
Je kunt ook altijd zelf vragen: "Geef mijn briefing" of "Hoe ziet mijn dag eruit?".

Aanzetten op de iPhone (eenmalig, iOS 16.4 of nieuwer):
1. Open sekibar.nl in **Safari** → deelknop → **Zet op beginscherm** (meldingen werken op iPhone alleen vanuit de app op je beginscherm).
2. Open **ECO vanaf je beginscherm** → ☰ MENU → BEDIENING → kies de tijd → tik **MELDINGEN UIT** → **Sta toe**.
3. Je krijgt meteen een testmelding en de knop wordt **MELDINGEN AAN**. Nog een keer tikken zet ze op dit apparaat uit.

Hoe het werkt: de database (pg_cron + pg_net, migratie `20261101_cron.sql`) roept de functie elke 30 seconden aan met een
willekeurige cron-sleutel die alleen in de server-opslag staat. Op de ingestelde tijd (tot 2 uur later, als de telefoon uit
stond) maakt de functie de briefing, bewaart hem en stuurt de melding via Web Push. De VAPID-sleutels maakt de functie zelf aan
en bewaart ze in de server-opslag: **geen secrets nodig**. Eén melding per dag, ook als de klok vaker tikt.

## Onderwerpen volgen, ongedaan maken en eerlijk melden
- **Volgen:** "Hou het nieuws over de HHS in de gaten" of "volg de prijs van de PS6". ECO kijkt elke dag tussen 12:00 en 22:00 één keer
  (Gemini met Google Search, gratis) of er écht nieuws is ten opzichte van wat hij al meldde. Bij nieuws komt er een melding en het staat
  in de volgende ochtendbriefing. "Wat volg je?", "stop met volgen van …" en "kijk nu even" werken ook. Hooguit tien onderwerpen.
- **Ongedaan maken:** "Maak dat ongedaan" of "draai de laatste twee terug" draait acties van de afgelopen dag terug: iets op een lijstje
  gezet, afgevinkt, verwijderd of een lijst leeggemaakt, een timer gezet of gestopt, een afspraak gemaakt (iCloud/Google), iets onthouden of
  vergeten, of een onderwerp gaan volgen.
- **Eerlijk melden:** elke actie krijgt een status: *gedaan* (gecontroleerd), *niet gecontroleerd* (verstuurd, geopend of klaargezet,
  bv. een WhatsApp die jij zelf verstuurt) of *mislukt*. Na "speel …" kijkt ECO of Spotify echt speelt; zo niet, dan zegt hij dat.
- **Gisteren in de briefing:** de ochtendbriefing sluit af met één zin over waar jullie gisteren over spraken (samengevat met een gratis
  model, één keer per dag), zonder een vraag te stellen.

## Lijstjes, notities en timers
Zeg gewoon wat je wilt; ECO regelt het en het LIJSTJES-paneel (rechts, op mobiel onder het rooster) werkt meteen bij.
- "Zet melk en brood op mijn boodschappenlijst", "noteer: idee voor het verslag …", "zet *Lisa bellen* op mijn takenlijst".
  Zonder lijstnaam komt het op **taken**. Typen kan ook: `boodschappen: melk, brood` in het invulveld van LIJSTJES.
- "Heb ik iets gemist?" of "wat moet ik nog doen?" → ECO noemt de open taken. "Melk is gekocht" → afgevinkt.
  In het paneel tik je een punt af (afgevinkte blijven 12 uur doorgestreept staan, tik nog eens om terug te zetten) of ✕ om te wissen.
- "Zet een timer van 10 minuten voor de thee", "herinner me om half vier aan de was", "hoe lang nog?", "stop de timer".
  Een ring rond de reactor telt af (tik erop om te stoppen). Als hij afgaat: piepjes (ook met GELUID uit), ECO zegt het hardop,
  en staat ECO dicht of op de achtergrond, dan krijg je binnen een halve minuut een **melding** (zet MELDINGEN aan, zie hierboven).
- De widget toont je open taken (groot formaat) en een lopende timer die live aftelt. Draai daarvoor het installatiescript nog één keer.
- De ochtendbriefing noemt ook hoeveel taken er nog open staan.

## Foto's laten zien
Tik op 📷 naast de microfoon (camera of fotobibliotheek; op de computer kun je ook plakken of slepen), kies tot drie foto's
en vraag iets: "wat staat er in deze brief?", "leg deze opgave uit", "zet deze afspraak in mijn agenda". Zonder vraag kijkt
ECO gewoon wat er op staat. Ook inspreken kan: de foto gaat mee met je ingesproken vraag. De browser verkleint foto's eerst;
Gemini (gratis) kijkt ernaar. In het archief bewaart ECO alleen "📷 foto" bij je vraag, niet de foto zelf.

## Archief doorzoeken
Vraag "weet je nog wat je zei over Tokio?" of "waar hadden we het vorige week over mijn verslag?": ECO zoekt in al je
eerdere gesprekken en vat het samen met de datum. In het menu staat bij ARCHIEF ook een zoekveld (zoekt in titels én tekst).

## Live-gesprek (realtime, zoals JARVIS) — gratis
Staat **LIVE** aan (BEDIENING, standaard aan), dan praat je realtime met ECO via **Gemini 3.8 Live** (gratis laag): hij hoort je
stem rechtstreeks en antwoordt binnen een halve seconde met echte intonatie, en je kunt hem altijd onderbreken.
- **Starten:** ECO openen (beginscherm, "Hé Siri, start Eco" of "Hé Eco") of op de microfoon tikken. Op de iPhone is soms één tik
  nodig voordat geluid mag (regel van Apple); dan verschijnt de knop *TIK OM LIVE TE PRATEN*.
- **Stoppen:** zeg "stop", "oké stop maar", "dat was het" of "bedankt", of tik op de groene microfoon. Na een minuut stilte hangt
  ECO vanzelf op (spaart batterij en quotum). "Stop de muziek" of "bedankt, hoe laat is het?" stopt het gesprek niet.
- **Wat ECO weet en kan:** zijn karakter, wat hij over je onthoudt, je agenda van vandaag en morgen (Brightspace gaat voor), het weer
  en je lijstjes. Tools werken tijdens het gesprek (timer, lijstjes, agenda, Spotify, WhatsApp, diep nadenken, …); ECO praat
  ondertussen door. Actuele dingen zoekt hij op met Google Search. Elke beurt komt in het archief ("🎙️ live · …").
- **Typen** tijdens een live gesprek: ECO antwoordt hardop in hetzelfde gesprek. Met een foto gaat de vraag via de gewone weg.
- **Veilig:** de echte `GEMINI_API_KEY` blijft op de server; de app krijgt per gesprek een tijdelijke code die alleen voor Live
  werkt en na 30 minuten verloopt. Elke ~10 minuten verbindt ECO ongemerkt opnieuw (sessiehervatting).
- **Microfoon:** ECO controleert in de eerste seconden of er echt geluid binnenkomt. Geeft de microfoon alleen stilte (vaak bij
  Bluetooth in de auto: die microfoon gaat meestal alleen open bij een echt telefoongesprek), dan schakelt hij vanzelf naar de
  iPhone-microfoon en onthoudt dat. Lukt niets, dan zegt hij dat en werkt hij op de gewone manier.
- **Microfoon kiezen en testen** (BEDIENING): kies MICROFOON: AUTOMATISCH of een microfoon op naam (bv. de iPhone-microfoon in de
  auto) en tik op **TEST**: acht seconden een meter met ✓ ECO HOORT JE of ✗ alleen stilte. De keuze geldt voor Live, gewone spraak en
  onderbreken. De namen verschijnen nadat je ECO één keer de microfoon hebt laten gebruiken.
- **Microfoonmeter** (onder de ondertitel, ook op de telefoon): welke microfoon ECO gebruikt (en waarom, na een wissel), wat hij
  hoort (STIL, ACHTERGRONDGELUID, STEM, ECO VERSTAAT JE, of ECO PRAAT · praat harder om te onderbreken, of ALLEEN STILTE ·
  microfoon dicht?), een balk met het streepje als grens voor stem en een piekmarkering, het niveau in dB, en of het geluid echt
  naar Gemini gaat (→ GEMINI 30 kB/s). Bij SYSTEEMSTATUS → SPRAAK staat het niveau in dB.
- **Echo:** zonder oortjes kan de microfoon ECO's eigen stem horen. ECO laat tijdens zijn eigen stem alleen geluid door dat duidelijk
  harder is dan zijn echo; met oortjes werkt het het best.
- **Terugval:** lukt Live niet (quotum op, storing), dan zegt ECO dat en werkt hij tien minuten op de gewone manier (Whisper +
  Groq/Gemini + stem). Model instelbaar met secret `LIVE_MODEL` (standaard `gemini-3.8-live`); de systeemcheck test het.

## Onderbreken
Staat **ONDERBREKEN** aan (BEDIENING, standaard aan), dan luistert ECO mee terwijl hij praat. Begin je te praten, dan stopt hij
meteen en neemt hij je vraag op. Tikken op de microfoon werkt ook altijd. Op de iPhone klinkt ECO wat zachter zolang hij meeluistert
(iOS zet de microfoon dan in gespreksstand); vind je dat vervelend, zet ONDERBREKEN dan uit.

## Spotify
Zeg "speel Blinding Lights", "zet Drake op", "speel mijn opgeslagen nummers", "pauze", "volgende", "zachter" of "wat speelt er?".
- **Zonder koppeling (of zonder Premium):** ECO opent Spotify op de juiste zoekopdracht of het juiste nummer; jij tikt op play.
- **Met koppeling + Spotify Premium:** ECO bedient Spotify zelf (afspelen, pauze, volgende/vorige, volume, shuffle, wachtrij,
  wat er speelt). Sinds 2026 eist Spotify Premium voor elke eigen koppeling; zonder Premium blijft het bij links openen.

Koppelen (eenmalig, ±3 minuten, geen geheime sleutel nodig):
1. Ga naar https://developer.spotify.com → log in met je Spotify-account → **Dashboard** → **Create app**.
   Naam `ECO`, beschrijving wat je wilt, **Redirect URI** precies `https://sekibar.nl/` (met de slash) → vink **Web API** aan → **Save**.
2. Open de app → **Settings** → kopieer de **Client ID** (de Client secret heb je niet nodig).
3. Open sekibar.nl (liefst in Safari of op de computer) → ☰ MENU → BEDIENING → **SPOTIFY KOPPELEN** → plak de Client ID →
   log in bij Spotify → **Agree**. Je komt terug in ECO met "Spotify gekoppeld"; de knop wordt groen.
Gebruik je voor de developer-site een ander Spotify-account dan waarmee je luistert, voeg dat account dan toe onder
*User Management* van de app. Spotify moet ergens open staan (telefoon of computer); staat hij nergens open, dan opent ECO de app.
Ontkoppelen: tik op **SPOTIFY GEKOPPELD**.

## WhatsApp
"Stuur Lisa via WhatsApp dat ik tien minuten later ben" → WhatsApp opent met het bericht al ingevuld voor Lisa; jij drukt op versturen.
- ECO onthoudt nummers: "het nummer van Lisa is 06 12345678" (ook buitenlandse nummers met +32, +49, …). "Welke contacten ken je?",
  "vergeet Lisa" werken ook. Kent ECO iemand niet, dan opent WhatsApp en kies je zelf het contact.
- Werkt ook via "Hé Siri, Eco" (de opdracht opent de link die ECO teruggeeft).
- ECO verstuurt nooit zelf iets en kan geen berichten lezen: WhatsApp biedt dat niet voor persoonlijke accounts.

## iPhone-widget (gratis, met Scriptable)
Een widget op je beginscherm en vergrendelscherm met je volgende lessen (de Brightspace-planning gaat voor), het weer met een tip
("Neem een paraplu mee"), deadlines en actiepunten uit het dagrapport. Tik erop om ECO te openen. Ververst ongeveer elk kwartier.
1. Installeer **Scriptable** uit de App Store (gratis).
2. Open in Safari https://sekibar.nl/widget/installeer.js, kopieer alle tekst; in Scriptable → **+** → plak → tik **▶**.
   Er verschijnt een script **ECO**.
3. Tik op **ECO** → log in met **dezelfde e-mail en hetzelfde wachtwoord als op sekibar.nl**. Je wachtwoord wordt niet bewaard,
   alleen de inlogsessie (in de iOS-sleutelhanger); die ververst zichzelf. Met **Voorbeeld middel** zie je meteen het resultaat.
4. (Optioneel, later) Wil je in plaats daarvan een vaste sleutel, zet dan `JARVIS_KEY` in Supabase; de widget gebruikt die als hij
   in de sleutelhanger staat.
5. Beginscherm: houd ingedrukt → **+** → Scriptable → kies klein, middel of groot → tik op de widget → *Script*: **ECO**.
   Vergrendelscherm: houd het vergrendelscherm ingedrukt → Pas aan → widgets → Scriptable → kies **ECO**.
Bijwerken naar een nieuwe versie: draai het installatiescript nog een keer.

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
- **Mobiel:** swipe van links naar rechts (of tik ☰ MENU) voor archief, bediening, weer en status; swipe terug of tik ernaast om te
  sluiten. Tik op een paneeltitel (TRANSCRIPT, ROOSTER, PROFIEL) om het in of uit te klappen.
- **GESPREK** (bij BEDIENING): handsfree praten zonder Live. Na elk antwoord luistert ECO vanzelf weer; zeg "stop", "oké stop maar" of
  "dat was het" en hij stopt meteen (ook "Hé Eco" luistert dan niet meer mee tot je weer op de microfoon tikt). Hoort ECO zichzelf
  terug via de speaker, dan antwoordt hij daar niet op maar wacht hij.
  Tik tijdens het praten op de microfoon om ECO te onderbreken.
- Spraakherkenning werkt in Chrome, Edge en Safari.

## Volgende stappen (ideeën)
- **Meer gratis reserve (besloten 29 okt):** wordt het gratis quotum van Groq/Gemini vaak bereikt, dan Mistral toevoegen als extra
  gratis reserve rechtstreeks in de functie (secret `MISTRAL_API_KEY`, gratis te maken). **Geen OmniRoute:** dat moet dag en nacht
  op een eigen server draaien, vraagt per dienst een eigen account, en een deel van de routes valt in een grijs gebied qua voorwaarden.
- Meer tools: weer, lampen/thermostaat (Home Assistant), notities, iCloud-agenda rechtstreeks (CalDAV met app-specifiek wachtwoord).
- Geheugen: vaste feiten over jou die ECO onthoudt.
- Betere stem: een TTS-dienst (bv. ElevenLabs) voor een echte ECO-stem.
- Wake-word ("Eco") op een altijd-aan apparaat, bv. een Raspberry Pi.
