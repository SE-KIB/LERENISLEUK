# NOVA — Nice Operating Variant Agent (ECO op je Windows-laptop)

NOVA is ECO's versie op je laptop. **Online** zegt NOVA "Verbonden met ECO" en gebruikt het ECO-brein (Groq/Gemini, gratis),
met hetzelfde geheugen, dezelfde agenda en hetzelfde archief. **Offline** zegt NOVA "Offline, ik gebruik nu mijn eigen brein" en
praat met een model op je laptop (Ollama). ECO kan je laptop bovendien bedienen, ook vanaf je iPhone, zolang NOVA draait.

## Installeren (eenmalig, ongeveer 10 minuten)
1. **Download NOVA.exe:** https://github.com/SE-KIB/LERENISLEUK/releases/latest/download/NOVA.exe
   Windows kan waarschuwen ("Windows heeft uw pc beschermd") omdat de exe niet ondertekend is: **Meer info → Toch uitvoeren**.
2. **Eerste start:** NOVA opent de instellingen. Vul bij **ECO-SLEUTEL** dezelfde geheime tekst in als `JARVIS_KEY` in Supabase en kies
   **OPSLAAN**. De sleutel blijft alleen op je laptop (`%APPDATA%\NOVA\config.json`). Bovenin staat dan **● VERBONDEN**.
3. **Offline brein (aanrader):** installeer **Ollama** van https://ollama.com/download/windows en start het. Kies in NOVA **⚙ → MODEL
   DOWNLOADEN**. Standaard is dat `qwen3.5:9b` (ongeveer 6 GB; past in de 8 GB van je RTX PRO). Slimmer maar trager: `gpt-oss:20b` of
   `gemma4:26b` (die lopen deels via je werkgeheugen).
4. **Bijwerken gaat vanzelf:** NOVA kijkt bij het starten en elke 6 uur of er een nieuwere versie op GitHub staat, downloadt en
   controleert die, vervangt zichzelf en start opnieuw (nooit midden in een gesprek). Je instellingen blijven bewaard.
5. **Automatisch starten (optioneel):** druk Win+R, typ `shell:startup`, en zet daar een snelkoppeling naar NOVA.exe.

## Gebruiken
- **Zelfde interface als ECO:** reactor, LOKALE TIJD, SYSTEEMSTATUS (brein, ECO, offline model, Ollama, spraak, stem), BEDIENING
  (stem, ECO-sleutel, naam, offline model, MODEL DOWNLOADEN), TRANSCRIPT en PC-ACTIES (wat NOVA op je laptop deed, met
  gedaan / niet gecontroleerd / mislukt). Het venster gebruikt ECO's eigen opmaak via de browsermotor van Windows (WebView2).
  Lukt dat niet, dan opent NOVA een eenvoudig venster (`NOVA.exe --eenvoudig` doet dat ook).
- **Typen** onderin en Enter, of **🎙** (of Ctrl+Spatie) en praten; NOVA stopt vanzelf met luisteren als je stil bent.
- **Bovenin** zie je welk brein antwoordt: ● VERBONDEN (ECO-brein) of ● OFFLINE (eigen brein, met het model erbij).
- **Je laptop bedienen**, ook via ECO op je iPhone ("open Spotify op mijn laptop"):
  apps openen (Spotify, Word, Chrome, Discord, …), een website openen, muziek (afspelen, pauze, volgende), het volume, tekst typen,
  een bestand zoeken of openen, het scherm bekijken ("wat staat er op mijn scherm?"), vergrendelen, afsluiten of herstarten
  (na 30 seconden; "stop met afsluiten" annuleert), en info (batterij, tijd).
- **Eerlijk:** NOVA zegt alleen "gedaan" als hij het kon controleren (bv. Spotify draait echt); anders zegt hij dat hij het probeerde.
- **Offline** weet NOVA wat ECO over je onthoudt en je agenda van de laatste keer online; weer, nieuws en mail kunnen dan niet.
  De Nederlandse spraakherkenning voor offline (Vosk, ~40 MB) haalt NOVA vanzelf op zodra hij online is.
- **Documenten:** "lees mijn verslag water", "wat staat er in de PDF van de toets?": NOVA leest pdf, Word, Excel, PowerPoint en
  tekstbestanden (uit Bureaublad, Documenten, Downloads, OneDrive, …) en het brein vat samen of beantwoordt je vraag. "Maak een PDF
  (of Word-document) met deze samenvatting": komt in **Documenten\NOVA**, gaat meteen open en overschrijft nooit iets. Werkt ook offline
  en vanaf je iPhone via ECO. Een gescande PDF zonder tekst: open hem en vraag "wat staat er op mijn scherm?".
- **Stem:** online ECO's eigen stem (Gemini), die al klinkt terwijl hij nog binnenkomt. Lukt die niet, of ben je offline, dan
  **Piper** met de Vlaamse stem *nathalie* (goed verstaanbaar, ~63 MB, haalt NOVA vanzelf op zodra hij online is). Daarna alleen
  een **Nederlandse** Windows-stem; een Engelse stem gebruikt NOVA nooit, dan antwoordt hij alleen met tekst.
  Bij **STEM** in SYSTEEMSTATUS zie je welke stem sprak; staat er ⚠, wijs het dan aan voor de reden (die staat ook in het transcript).
- **ECO's systeemcheck** toont **NOVA (laptop)**: OK als NOVA draait.

## Veilig
- NOVA voert alleen vaste acties uit (geen vrije opdrachten), en ECO gebruikt de pc alleen op basis van wat jij zelf zegt, nooit op
  basis van mail, webpagina's of beelden. In NOVA.exe zit geen sleutel; de bouw gebeurt openbaar via GitHub Actions
  (`.github/workflows/nova-build.yml`).

## Problemen
- **Zelftest:** start `NOVA.exe --selftest`; het rapport staat in `%APPDATA%\NOVA\zelftest.txt`. Stuur dat naar Claude.
- **"ECO weigert de sleutel":** de ECO-sleutel in ⚙ klopt niet met `JARVIS_KEY` in Supabase.
- **"Ollama draait niet":** start Ollama (staat na installatie rechtsonder bij de klok) en kies opnieuw MODEL DOWNLOADEN.

## Voor ontwikkelaars
Code: `nova/` (`nova.py` venster, `nova_core.py` ECO-verbinding/brug/lokaal brein, `nova_pc.py` pc-acties, `nova_doc.py` documenten
lezen/maken (pypdf, python-docx, openpyxl, python-pptx, fpdf2), `nova_stem.py` stem:
opnemen, Vosk, ECO's stem als stroom (`{ tts, stream: true }` → `audio/l16`, 24 kHz), Piper `nl_BE-nathalie-medium` in `%APPDATA%\NOVA\stem`).
Tests: `cd nova && python -m unittest -v test_nova`. De brug: NOVA belt ECO's functie met `{ nova: { actie: "wacht" } }`
(long-poll, ~25 s), voert opdrachten uit de wachtrij uit en meldt ze terug met `{ actie: "klaar" }`; ECO's tool `pc` wacht daarop.
