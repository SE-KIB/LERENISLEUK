# ECO op je Windows-laptop (bestand NOVA.exe; offline brein N.O.V.A.)

De laptop-app heet gewoon **ECO**, net als op je iPhone. Alleen het offline brein heet **N.O.V.A.** (Nice Operating Variant Agent).
Het bestand heet nog `NOVA.exe` (het automatisch bijwerken rekent op die naam). Bovenin staat met welk brein ECO nu verbonden is:
- **● VERBONDEN MET ECO** (online): ECO's brein in de cloud (Groq/Gemini, gratis), met hetzelfde geheugen, dezelfde agenda en hetzelfde archief.
- **● VERBONDEN MET N.O.V.A.** (offline): het offline brein, een model op je laptop (Ollama). Werkt ook zonder internet.
Je **kiest zelf** bij BEDIENING → **BREIN: ECO | N.O.V.A.** (standaard ECO). Is het gekozen brein er even niet (geen internet, of
Ollama draait niet), dan neemt het andere het over: dan staat de regel bovenin oranje met de reden. ECO op je iPhone kan je laptop
bovendien bedienen zolang de laptop-app draait.
- **Onthouden:** ECO onthoudt het transcript (laatste 200 regels), de PC-acties, het gesprek (gaat verder als de laatste vraag
  minder dan 12 uur geleden was), alle instellingen, de indeling en de plek en grootte van het venster, ook als je hem uit en aan
  zet (`%APPDATA%\NOVA\geschiedenis.json` en `config.json`). Wissen: Instellingen → Beeld → TRANSCRIPT WISSEN.

## Installeren (eenmalig, ongeveer 10 minuten)
1. **Download NOVA.exe:** https://github.com/SE-KIB/LERENISLEUK/releases/latest/download/NOVA.exe
   Windows kan waarschuwen ("Windows heeft uw pc beschermd") omdat de exe niet ondertekend is: **Meer info → Toch uitvoeren**.
2. **Eerste start:** NOVA opent de instellingen. Vul bij **ECO-SLEUTEL** dezelfde geheime tekst in als `JARVIS_KEY` in Supabase en kies
   **OPSLAAN**. De sleutel blijft alleen op je laptop (`%APPDATA%\NOVA\config.json`). Bovenin staat dan **● VERBONDEN MET ECO**.
3. **NOVA's eigen brein (aanrader):** installeer **Ollama** van https://ollama.com/download/windows en start het. Kies in NOVA **⚙ → MODEL
   DOWNLOADEN**. Standaard is dat `qwen3.5:9b` (ongeveer 6 GB; past in de 8 GB van je RTX PRO). Slimmer maar trager: `gpt-oss:20b` of
   `gemma4:26b` (die lopen deels via je werkgeheugen).
4. **Bijwerken:** zodra NOVA verbonden is (en daarna elk uur) kijkt hij of er een nieuwere versie op GitHub staat. Zo ja, dan
   vraagt hij het: bovenin verschijnt **NU BIJWERKEN / LATER** en NOVA zegt het hardop. Klik, typ of zeg "ja" (of "doe maar"), dan
   downloadt en controleert hij de nieuwe versie (met voortgang), vervangt zichzelf en start meteen opnieuw. Bij "later" vraagt hij
   het over 4 uur weer. Je instellingen blijven bewaard.

## Gebruiken
- **Zelfde interface als ECO:** reactor, LOKALE TIJD, SYSTEEMSTATUS (brein, ECO, NOVA-model, Ollama, spraak, stem), BEDIENING
  (alleen **BREIN: ECO | NOVA** en **⚙ INSTELLINGEN**), TRANSCRIPT en PC-ACTIES (wat NOVA op je laptop deed, met
  gedaan / niet gecontroleerd / mislukt). Het venster gebruikt ECO's eigen opmaak via de browsermotor van Windows (WebView2).
  Lukt dat niet, dan opent NOVA een eenvoudig venster (`NOVA.exe --eenvoudig` doet dat ook).
- **⚙ INSTELLINGEN** (in BEDIENING), zodat de HUD rustig blijft:
  - **Geluid:** stem aan/uit, volume, TEST DE STEM.
  - **Beeld:** elk paneel (klok, systeemstatus, transcript, PC-acties, ondertitel, visualisatie) en elke regel van SYSTEEMSTATUS
    aan/uit; **MAGNETISCH** aan/uit en **STANDAARDINDELING**.
  - **AI-volgorde:** 1e/2e/3e keus voor het antwoord (ECO of NOVA), de modellen binnen ECO (Groq, Gemini, Claude), de stem
    (Gemini, Piper, Windows) en de spraakherkenning (Whisper, Vosk). Lukt de eerste niet, dan neemt de volgende het over.
    Plus het NOVA-model en MODEL DOWNLOADEN.
  - **Verbinding:** ECO-sleutel en de naam van de laptop.
- **Indeling naar wens:** sleep elk blok aan de kop naar een andere plek en aan de hoek rechtsonder om het groter of kleiner te
  maken. Met MAGNETISCH klikt het vast aan andere blokken en aan de rand (een cyaan hulplijn laat zien waar; Alt ingedrukt = vrij).
  NOVA onthoudt de indeling en schaalt mee als je het venster groter of kleiner maakt.
- **Typen** onderin en Enter, of **🎙** (of Ctrl+Spatie) en praten; NOVA stopt vanzelf met luisteren als je stil bent.
- **2× klappen** = hetzelfde als 🎙: klap twee keer kort achter elkaar en ECO luistert. Wordt op de laptop zelf herkend (het geluid
  gaat nergens heen); één klap, applaus, praten en muziek tellen niet. Aan/uit bij Instellingen → GELUID, of zeg "zet klappen uit".
  SYSTEEMSTATUS → 2× KLAPPEN laat zien of het werkt (GEEN MICROFOON = geen microfoon gevonden).
- **Bovenin** zie je welk brein antwoordt: ● VERBONDEN MET ECO of ● VERBONDEN MET NOVA (groen = jouw keuze, oranje = het andere
  brein nam het over). Met NOVA als brein verstaat NOVA je online nog steeds met Whisper (via ECO), anders met Vosk.
- **Je laptop bedienen**, ook via ECO op je iPhone ("open Spotify op mijn laptop"):
  apps openen (Spotify, Word, Chrome, Discord, …), een website openen, muziek (afspelen, pauze, volgende), het volume, tekst typen,
  een bestand zoeken of openen, het scherm bekijken ("wat staat er op mijn scherm?"), vergrendelen, afsluiten of herstarten
  (na 30 seconden; "stop met afsluiten" annuleert), en info (batterij, tijd).
- **Eerlijk:** NOVA zegt alleen "gedaan" als hij het kon controleren (bv. Spotify draait echt); anders zegt hij dat hij het probeerde.
- **Met NOVA's eigen brein** weet NOVA wat ECO over je onthoudt en je agenda van de laatste keer online; weer, nieuws en mail kunnen dan niet.
  De Nederlandse spraakherkenning voor offline (Vosk, ~40 MB) haalt NOVA vanzelf op zodra hij online is.
- **Documenten:** "lees mijn verslag water", "wat staat er in de PDF van de toets?": NOVA leest pdf, Word, Excel, PowerPoint en
  tekstbestanden (uit Bureaublad, Documenten, Downloads, OneDrive, …) en het brein vat samen of beantwoordt je vraag. "Maak een PDF
  (of Word-document) met deze samenvatting": komt in **Documenten\ECO**, gaat meteen open en overschrijft nooit iets. Werkt ook offline
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
Het app-icoon (de reactor) maakt de bouwstraat met `nova/maak_icoon.py`.
Code: `nova/` (`nova.py` venster, `nova_core.py` ECO-verbinding/brug/lokaal brein, `nova_pc.py` pc-acties, `nova_doc.py` documenten
lezen/maken (pypdf, python-docx, openpyxl, python-pptx, fpdf2), `nova_stem.py` stem:
opnemen, Vosk, ECO's stem als stroom (`{ tts, stream: true }` → `audio/l16`, 24 kHz), Piper `nl_BE-nathalie-medium` in `%APPDATA%\NOVA\stem`).
Tests: `cd nova && python -m unittest -v test_nova`. De brug: NOVA belt ECO's functie met `{ nova: { actie: "wacht" } }`
(long-poll, ~25 s), voert opdrachten uit de wachtrij uit en meldt ze terug met `{ actie: "klaar" }`; ECO's tool `pc` wacht daarop.
