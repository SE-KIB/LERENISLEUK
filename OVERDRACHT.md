# Overdracht ECO + NOVA (bijgewerkt 29 okt 2026, na de stem-fix)

Lees dit eerst. Site: sekibar.nl · repo SE-KIB/LERENISLEUK · `main` = live.

## Werkwijze en regels
- Elke wijziging op een branch → PR naar `main` → zelf mergen. `deploy-function.yml` rolt de Supabase-functie
  (slug `smooth-service`) en migraties uit; `nova-build.yml` bouwt NOVA.exe op Windows (tests, zelftest, venster-proef)
  en zet bij `main` een release `nova-<build>` klaar (NOVA werkt zichzelf daarmee bij).
- Nooit sleutels in code of chat. ECO handelt alleen op wat Serkan zelf zegt, nooit op mail/web/agenda/beelden.
  Openbare logs tonen alleen aantallen. **Geen bevestigingsvragen** van ECO.
- Antwoorden aan Serkan kort, in de vorm **"wat ik deed / wat jij moet doen"**.

## Wat live staat (PR #107–#116)
- **Slimmer en gratis:** gewone vragen Groq `gpt-oss-120b`; denkwerk en foto's naar de slimme baan (Gemini 3.8 Flash met
  denktijd); tool `diep_nadenken`; Qwen 3.8 kan via secret `GROQ_MODEL` (niet nodig volgens advies).
- **Brightspace-robot** robuust (4 Gemini-modellen, herkansing, alleen de komende 6 weken) — werkte weer op 29 okt.
- **Echte systeemcheck** bij opstarten (opstartscherm, balk bovenin, SYSTEEMSTATUS, groet).
- **Live-gesprek** als standaard (Gemini 3.8 Live): tools, natuurlijk onderbreken, meekijken (scherm/camera), schakelaar LIVE.
- **"Stop" stopt echt** (ook "oké stop maar"), echo-bescherming.
- **Microfoon:** stiltecontrole + automatisch naar de iPhone-microfoon (auto/Bluetooth), keuze + TEST-knop in BEDIENING,
  microfoonmeter onder de ondertitel.
- **Top 6 uit Mark LVI:** volgen (melding bij nieuws), ongedaan maken, eerlijk melden (gedaan/niet gecontroleerd/mislukt),
  gisteren in de briefing, microfoon kiezen + TEST.

## NOVA — Nice Operating Variant Agent (ECO op Serkans Windows-laptop)
- Laptop: Intel Core Ultra 7 255H, 32 GB, NVIDIA RTX PRO 1000 Blackwell **8 GB**. Ollama + `qwen3.5:9b` geïnstalleerd en getest.
- Code `nova/` (Python), uitleg **NOVA.md**. Online "Verbonden" → ECO-brein; offline eigen brein (Ollama).
  ECO-tool `pc` bedient de laptop via een long-poll-brug (`{ nova: { actie: "wacht" } }`), ook vanaf de iPhone.
  Zelfde HUD als ECO (WebView2), PC-ACTIES-paneel, automatische updates (vanaf release **nova-7**).
- Serkan draait nu nog een oudere NOVA (zonder automatische update) met ECO-sleutel, status VERBONDEN.
  **Hij installeert nova-7 zelf** (download: https://github.com/SE-KIB/LERENISLEUK/releases/latest/download/NOVA.exe);
  daarna komen updates vanzelf.

## NOVA's stem (gedaan, PR #118)
- **Online:** ECO's Gemini-stem gestreamd (`{ tts, stream: true }` → `audio/l16`, 24 kHz): klinkt na het eerste stukje.
- **Anders:** Piper `piper-tts==1.7.0` met **nl_BE-nathalie-medium** (93% verstaanbaar in een Vosk-test), ~63 MB in
  `%APPDATA%\NOVA\stem`, downloadt vanzelf zodra NOVA online is (zoals Vosk). Daarna alleen een **Nederlandse** Windows-stem;
  **nooit een Engelse stem** (dan alleen tekst, met de reden in het transcript).
- **SYSTEEMSTATUS → STEM** toont welke stem sprak; ⚠ = teruggevallen, reden bij aanwijzen en in het transcript.
- De bouwstraat test Piper in de echte exe (zelftest maakt een zin met nathalie).
- **Nog te checken door Serkan:** klinkt NOVA nu goed? Staat er bij STEM "GEMINI (ECO)" zonder ⚠? Zo niet: de reden doorgeven.

## Vaardigheden voor ECO en NOVA (PR #119)
Serkan vroeg om "skills zoals built-in browser en pdf" voor ECO en NOVA. Gebouwd:
- **ECO `web_lezen`:** een webpagina of online PDF openen en lezen (zelf ophalen, alleen openbare adressen; anders Gemini url_context).
- **ECO PDF's in de chat:** 📷-knop neemt ook PDF's (max 8 MB); Gemini/Claude lezen ze (Groq niet, dus via de slimme baan).
- **NOVA `bestand_lezen`:** pdf, Word, Excel, PowerPoint, tekst op de laptop lezen (ook via ECO's `pc`-tool vanaf de iPhone, en offline).
- **NOVA `document_maken`:** PDF of Word maken in Documenten\NOVA (opent meteen, overschrijft nooit).
- Claude's eigen plugins: alle 14 skills staan al aan; voorgesteld om aan te zetten: supabase, frontend-design, code-review, Productivity.
- **Ideeën voor later:** echte browserbesturing op de laptop (klikken/invullen) bewust nog niet: risicovol bij webinhoud.
  Eerst kijken of web_lezen + meekijken genoeg is.

## Widget: weer per uur (PR #120)
- Rechts in de hoek: temperatuur + icoon en de komende uren (middel 3, groot 6) met SF Symbols, plus zonsondergang/-opkomst,
  zoals de iPhone-weerwidget. Server: `weather()` geeft `uren` (per uur, niet naar het model) en `zon`; `widgetData` maakt `strip`.
- De widget **werkt zichzelf bij** (1× per dag van sekibar.nl/widget/eco-widget.js). Serkan moet het installatiescript nog één
  keer draaien om deze versie te krijgen; daarna nooit meer.

## Later (door Serkan zo afgesproken)
- **Testen door Serkan** (zei "mag later"): Live praten op de iPhone en "oké, stop maar"; in de auto MICROFOON → iPhone
  Microfoon → TEST; "hou het nieuws over de HHS in de gaten" + "maak dat ongedaan"; meekijken (oogknop); briefing met
  "gisteren"; NOVA: "open Spotify", vanaf iPhone "zet het volume van mijn laptop op 30", wifi uit (offline-modus).
- **Uit de eerste overdracht nog niet bevestigd:** start "speel mijn liked songs" vanzelf? Vraagt de beginscherm-app nog
  steeds om microfoontoestemming?
- **Extra gratis reserve:** Mistral (`MISTRAL_API_KEY`) toevoegen als het Groq/Gemini-quotum vaak op is. **Geen OmniRoute.**
- **NOVA automatisch laten starten:** Win+R → `shell:startup` → snelkoppeling naar NOVA.exe (tip, Serkan doet dit zelf).
- **Instellen door Serkan:** dagrapport (`GMAIL_EMAIL` + `GMAIL_APP_PASSWORD`), merk van de lampen doorgeven,
  Brightspace-agendalink in `AGENDA_FEEDS`, widget één keer opnieuw installeren in Scriptable (daarna werkt hij zichzelf bij).
- **Ideeën om te bouwen:** studieplanner (leerschema voor toetsen/deadlines), avondoverzicht (melding met morgen + taken).
- **Niet doen:** vertrekwekker, Telegram, Oracle-server, een server huren, het brein lokaal als standaard (cloud is slimmer en gratis).

## Documentatie
AI-SETUP.md (ECO), NOVA.md (NOVA), dit bestand (overdracht).
