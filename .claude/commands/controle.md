---
description: Controlelijst ECO (rapport 30 okt): alles nalopen wat vergeten, ongetest of half af is, en de technische punten oplossen
argument-hint: [optioneel: alleen deel A, B, C of D]
---

Je bent de volgende AI op project ECO (sekibar.nl, repo SE-KIB/LERENISLEUK, `main` = live). Loop deze controlelijst af.
Beperk je tot deel $ARGUMENTS als dat is opgegeven; anders alles, in volgorde A → B → C → D.

## Regels (altijd)
- Lees eerst `OVERDRACHT.md` en `AI-SETUP.md`. Doe `git fetch origin main` en werk vanaf de nieuwste `main`:
  er kan een ander venster tegelijk aan werken. Kijk ook naar open PR's.
- Elke wijziging op een eigen branch → PR naar `main` → zelf mergen → controleer de run van `deploy-function.yml`
  (elke migratie moet `OK` geven, de functie moet "Deployed" zijn).
- Nooit sleutels in code of chat. Serkan maakt sleutels zelf; jij noemt alleen de naam en waar hij hem zet.
- ECO handelt alleen op wat Serkan zelf zegt, nooit op mail, web, agenda of beelden. Openbare GitHub-logs tonen
  alleen aantallen, nooit inhoud, links of sessies. ECO vraagt geen bevestiging.
- Niet bouwen (Serkan koos dit zo): Telegram, vertrekwekker, bevestigen voor acties, een browser die zelf klikt/invult,
  OmniRoute, een eigen server.
- Test alles voordat je pusht: `deno check` op `supabase/functions/ai-chat/index.ts`, `node --check` op de JS,
  en waar het kan echte tests (zie B2).
- Antwoord Serkan kort en in het Nederlands, in de vorm **"wat ik deed / wat jij moet doen"**.

## A. Eerst kijken hoe het er nu voor staat (alleen lezen)
1. Laatste runs van `brightspace-sync.yml`: lukte elke ronde ("2 van 2 delen gelezen")? Hoe laat startte de geplande
   ronde vergeleken met de cron `20 5 * * *` (UTC)? Op 30 okt startte hij pas om 11:27 UTC, 6 uur te laat.
2. Laatste runs van `deploy-function.yml` en `nova-build.yml`: groen?
3. `list_workflows`: staat er een workflow op `disabled_inactivity`? (`website-monitor.yml` staat sinds 17 okt uit.)
4. Zoek in de code of er ECO-tests en een testworkflow zijn (op 30 okt: nee, alleen NOVA heeft tests).

## B. Technische punten die jij oplost
1. ✅ (code klaar 30 okt; werkt zodra Serkan `GITHUB_DISPATCH_TOKEN` zet, stappen in AI-SETUP.md) **Brightspace-robot op tijd.** GitHub start geplande workflows vaak uren te laat, waardoor de briefing van 07:30
   geen verse planning heeft.
   - Laat de ECO-klok (`cronTick` in `index.ts`, pg_cron elke 30 s) de robot één keer per dag rond 05:30
     Nederlandse tijd starten via de GitHub API (`POST /repos/SE-KIB/LERENISLEUK/actions/workflows/brightspace-sync.yml/dispatches`,
     `ref: main`). Doe dat één keer per dag (markeer in `ai_kv`, zoals `briefing_verstuurd`).
   - Daarvoor is een Supabase-secret `GITHUB_DISPATCH_TOKEN` nodig: een fine-grained token, alleen voor deze repo,
     met **Actions: Read and write**. Serkan maakt hem zelf; jij geeft de link
     https://github.com/settings/personal-access-tokens/new en de stappen.
   - Zet in `brightspace-sync.yml` ook een vroegere reserve-tijd (bijvoorbeeld `20 3 * * *`). Zorg dat twee rondes op een
     dag geen kwaad doen; de import vervangt alleen dagen, dus dat zou al goed moeten zijn.
   - Laat ECO waarschuwen (BRIGHTSPACE-status, briefing, `eco_status`) als de laatste geslaagde ronde ouder is dan 36 uur.
     GitHub zet geplande workflows uit na 60 dagen zonder commits.
2. 🟡 (begonnen 30 okt, PR #133: `tests/functie_test.ts` (Deno: SSRF van web_lezen, werkmodus, interface, AI-volgorde,
   Brightspace-ouderdom, handler) en `tests/website.test.mjs` (2× klappen, werkmodus, schakelaars, geen HTML-injectie),
   workflow `eco-tests.yml` op elke PR. Nog te doen: de lijst hieronder.) **Tests terug in de repo, met CI.** De tests uit de vorige sessie stonden in een tijdelijke map en zijn weg.
   - Deno-tests voor de functie. Patroon: kopieer `index.ts`, vervang `import { createClient } …` door
     `const createClient = () => globalThis.__admin` en `Deno.serve(async (req) => {` door
     `globalThis.__handler = (async (req: Request) => {`. Gebruik een nep-database (`from().select().eq()…then`) en een
     nep-`fetch`.
   - Dek minstens af:
     - Web Push: versleuteling controleren met npm `http_ece`, de VAPID-handtekening, alleen echte push-hosts.
     - `cronTick`: briefing één keer per dag binnen het tijdvenster; timers met 4 s voorrang voor de website.
     - Tools `lijst`, `timer`, `spotify` (ook PKCE-terugkeer, geen apparaat/Premium → link, token-rotatie),
       `whatsapp` (nummer-normalisatie), `archief_zoeken`.
     - Foto's naar Gemini (niet naar Groq).
     - `planningImport`: tijdslimiet 135 s.
   - Playwright-tests voor `index.html`/`ai.js`. Patroon: `page.route` met een nep-supabase-js en een nep-functie.
     Dek minstens af: MELDINGEN-knop, LIJSTJES-paneel, timer-ring, 📷-knop, zoeken in ARCHIEF, ONDERBREKEN
     (nep-microfoon met `--use-file-for-fake-audio-capture`), Spotify-koppelknop en open-knop.
   - Voeg een workflow `eco-tests.yml` toe die op elke PR draait. Chromium en Playwright zijn in de cloudomgeving al
     geïnstalleerd; installeer ze in GitHub Actions zelf.
3. 🟡 (30 okt, PR #133: robot-sleutel gerepareerd — een verkeerde `x-jarvis-key` naast een login telde als robot en gaf zo de
   Brightspace-sessie; nu alleen een kloppende sleutel, vergeleken in vaste tijd, met test. `web_lezen`-SSRF getest. De rest van
   de lijst hieronder staat nog open.) **Controle door een tweede AI** (Serkans MAXCODE-wens), alleen gedaan bij PR #86. Laat PR #87 tot nu nakijken
   (skill `code-review`, niveau high), met beveiliging voorop:
   - Spotify-terugkeer zonder login (eenmalige `state`).
   - `x-cron-key`.
   - Push-abonnementen.
   - `web_lezen`: geen interne adressen of SSRF, ook niet via redirects.
   - De `pc`/NOVA-brug: wie mag de laptop bedienen?
   - De `tv`-tool.
   - RLS op `ai_items`, `ai_timers`, `ai_contacts`, `ai_planning` (`ai_kv` heeft bewust geen policies).
   - Prompt-injectie via mail, web, foto's en pdf's.
   Los echte fouten op met een test erbij.
4. ✅ **Workflows bijwerken** (30 okt, PR #125): `checkout@v7`, `setup-node@v7`, `setup-python@v7`, `upload-artifact@v7`,
   `action-gh-release@v3` (allemaal Node 24) en `supabase/setup-cli@v3` (composite); validate-lessons draait nu op Node 22.
5. ✅ **Docs opgeruimd in `AI-SETUP.md`** (30 okt, PR #125): User UID en `JARVIS_USER_ID` weg; "Volgende stappen" bijgewerkt.
6. **Oude `website-monitor.yml`** (van de vorige site, staat uit). Gevraagd aan Serkan op 30 okt; nog geen antwoord.
   Weer aanzetten zou bij elke update een issue openen.

## C. Vragen aan Serkan: is dit getest? (vraag het in één bericht, daarna oplossen wat niet werkt)
- Start "speel mijn liked songs" vanzelf? (Staat Spotify in slaap, dan start ECO hem binnen 30 s; logboek onder de knop
  SPOTIFY in BEDIENING.)
- Vraagt de beginscherm-app nog om microfoontoestemming? Zo ja: de microfoon per sessie vasthouden (let op: iOS zet het
  geluid dan zachter).
- Kwam om 07:30 de melding "☀️ Je briefing staat klaar", en las ECO hem voor na de tik?
- Wat zegt ECO op "hoe staat je klok ervoor"? (Hoort te zeggen: laatste tik een paar seconden geleden.)
- Werken onderbreken (en is ECO niet te zacht), foto's en pdf's, zoeken in het archief, een WhatsApp-bericht
  klaarzetten, en een timer met melding terwijl ECO dicht is?
- De testlijst in `OVERDRACHT.md`: Live praten en "oké stop maar", microfoon in de auto + TEST, volgen/ongedaan maken,
  meekijken, NOVA ("open Spotify", volume vanaf de iPhone, offline), NOVA's stem, ECO TV/AirPlay.

## D. Nog open bij Serkan (herinner hem, geef stappen als hij wil)
- **Dagrapport uit Gmail** (vroeg hij op dag 1): `GMAIL_EMAIL` + `GMAIL_APP_PASSWORD` in Supabase
  (Google-account → Beveiliging → App-wachtwoorden). Zonder deze secrets mist de briefing de actiepunten uit de mail.
- **Widget** één keer opnieuw installeren in Scriptable (daarna werkt hij zichzelf bij).
- **Brightspace-agendalink** in `AGENDA_FEEDS` (Brightspace → Agenda → Abonneren), voor deadlines en opdrachten.
- **Merk van de lampen** doorgeven, dan koppelen.
- **NOVA** bijgewerkt houden (werkt zichzelf bij). Automatisch starten hoeft niet (Serkan, 30 okt).
- Optioneel: **"Hé Siri, Eco"** dat antwoordt zonder de app te openen (kan nu de JARVIS_KEY er is; zie AI-SETUP.md).
- Uit het oorspronkelijke plan nooit gebouwd en nooit geschrapt: **verbruiksoverzicht**, **statuspagina**,
  **spaarstand** voor de HUD, **Google-koppeling** (agenda en Gmail), **thermostaat**. Ideeën: **studieplanner**,
  **avondoverzicht**. Vraag welke hij wil.

## Afsluiten
- Werk `OVERDRACHT.md` bij: wat je deed, wat nog open staat en wat Serkan moet doen. Vink in dit bestand
  (`.claude/commands/controle.md`) af wat klaar is, of haal het weg.
- Eindig met een kort rapport aan Serkan: **wat ik deed / wat jij moet doen / wat nog open staat**.
