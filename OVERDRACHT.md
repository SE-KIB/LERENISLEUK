# Overdracht ECO + NOVA (bijgewerkt 29 okt 2026)

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

## Eerst doen: NOVA's stem (lelijk en slecht verstaanbaar)
Waarschijnlijk valt NOVA terug op een **Engelse Windows-stem** (pyttsx3/SAPI) die Nederlands voorleest. Plan:
1. In SYSTEEMSTATUS tonen welke stem sprak (Gemini / Piper / Windows) en waarom hij terugviel.
2. Online: ECO's Gemini-stem gestreamd afspelen (`{ tts, stream: true }` → `audio/l16`, 24 kHz, little-endian).
3. Offline: **Piper** i.p.v. SAPI: `piper-tts==1.7.0` (win_amd64-wheel bestaat), stem **nl_BE-nathalie-medium**
   (93% verstaanbaar in een Vosk-test; nl_BE-rdh 73%; nl_NL-mls is slecht), van
   `huggingface.co/rhasspy/piper-voices/resolve/main/nl/nl_BE/nathalie/medium/nl_BE-nathalie-medium.onnx(.json)`.
   Downloaden zodra NOVA online is (zoals Vosk). API: `PiperVoice.load(onnx).synthesize(tekst)` → delen met
   `.audio_int16_bytes`, 22050 Hz (0,4 s voor een zin op CPU).
4. Nooit een Engelse stem voor Nederlandse tekst; liever alleen tekst met een tip.

## Later (door Serkan zo afgesproken)
- **Testen door Serkan** (zei "mag later"): Live praten op de iPhone en "oké, stop maar"; in de auto MICROFOON → iPhone
  Microfoon → TEST; "hou het nieuws over de HHS in de gaten" + "maak dat ongedaan"; meekijken (oogknop); briefing met
  "gisteren"; NOVA: "open Spotify", vanaf iPhone "zet het volume van mijn laptop op 30", wifi uit (offline-modus).
- **Uit de eerste overdracht nog niet bevestigd:** start "speel mijn liked songs" vanzelf? Vraagt de beginscherm-app nog
  steeds om microfoontoestemming?
- **Extra gratis reserve:** Mistral (`MISTRAL_API_KEY`) toevoegen als het Groq/Gemini-quotum vaak op is. **Geen OmniRoute.**
- **NOVA automatisch laten starten:** Win+R → `shell:startup` → snelkoppeling naar NOVA.exe (tip, Serkan doet dit zelf).
- **Instellen door Serkan:** dagrapport (`GMAIL_EMAIL` + `GMAIL_APP_PASSWORD`), merk van de lampen doorgeven,
  Brightspace-agendalink in `AGENDA_FEEDS`, widget opnieuw installeren in Scriptable (taken + timer).
- **Ideeën om te bouwen:** studieplanner (leerschema voor toetsen/deadlines), avondoverzicht (melding met morgen + taken).
- **Niet doen:** vertrekwekker, Telegram, Oracle-server, een server huren, het brein lokaal als standaard (cloud is slimmer en gratis).

## Documentatie
AI-SETUP.md (ECO), NOVA.md (NOVA), dit bestand (overdracht).
