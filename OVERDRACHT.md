# Overdracht ECO + NOVA (bijgewerkt 29 okt 2026, na de stem-fix)

Lees dit eerst. Site: sekibar.nl · repo SE-KIB/LERENISLEUK · `main` = live.

**Controlelijst (rapport 30 okt):** typ `/controle` (bestand `.claude/commands/controle.md`) en loop hem af: vergeten
punten, ongeteste functies en technische klussen (Brightspace-robot op tijd, tests + CI, controle door een tweede AI).

## Werkwijze en regels
- Elke wijziging op een branch → PR naar `main` → zelf mergen. `deploy-function.yml` rolt de Supabase-functie
  (slug `smooth-service`) en migraties uit; `nova-build.yml` bouwt NOVA.exe op Windows (tests, zelftest, venster-proef)
  en zet bij `main` een release `nova-<build>` klaar (NOVA werkt zichzelf daarmee bij).
- Nooit sleutels in code of chat. ECO handelt alleen op wat Serkan zelf zegt, nooit op mail/web/agenda/beelden.
  Openbare logs tonen alleen aantallen. **Geen bevestigingsvragen** van ECO.
- Antwoorden aan Serkan kort, in de vorm **"wat ik deed / wat jij moet doen"**.
- **Naamgeving (Serkan, 30 okt, vervangt de eerdere regel):** de laptop-app heet ook gewoon **ECO** (bestand blijft `NOVA.exe`, code
  blijft `nova/`). Alleen het **offline brein** heet **N.O.V.A.** Status: online **"Verbonden met ECO"**, offline **"Verbonden met
  N.O.V.A."**; nooit "offline-reserve: qwen…". Serkan kiest zelf (BEDIENING → BREIN: ECO | N.O.V.A.).

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
  Zelfde HUD als ECO (WebView2), PC-ACTIES-paneel, updates (vanaf release **nova-7**; vanaf PR #126 vraagt NOVA eerst
  "nu bijwerken?" zodra hij verbonden is en een nieuwe versie ziet, en doet het bij "ja" meteen).
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
- **NOVA `document_maken`:** PDF of Word maken in Documenten\ECO (opent meteen, overschrijft nooit).
- Claude's eigen plugins: alle 14 skills staan al aan; voorgesteld om aan te zetten: supabase, frontend-design, code-review, Productivity.
- **Ideeën voor later:** echte browserbesturing op de laptop (klikken/invullen) bewust nog niet: risicovol bij webinhoud.
  Eerst kijken of web_lezen + meekijken genoeg is.

## Widget: weer per uur (PR #120)
- Rechts in de hoek: temperatuur + icoon en de komende uren (middel 3, groot 6) met SF Symbols, plus zonsondergang/-opkomst,
  zoals de iPhone-weerwidget. Server: `weather()` geeft `uren` (per uur, niet naar het model) en `zon`; `widgetData` maakt `strip`.
- De widget **werkt zichzelf bij** (1× per dag van sekibar.nl/widget/eco-widget.js). Serkan moet het installatiescript nog één
  keer draaien om deze versie te krijgen; daarna nooit meer.

## Verstaan en tv (PR #121, #122)
- **#121:** ECO gooide duidelijke opdrachten weg ("ECO, open Spotify" → "(?) Sorry, dat verstond ik niet"). Nu Whisper's eigen
  grenzen (-1.0) en een duidelijke opdracht/vraag gaat altijd door (behalve als Whisper zichzelf herhaalt).
- **#122 Tv:** Serkan heeft een smart-tv met AirPlay en Spotify + YouTube op de tv. Spotify-tool kreeg `apparaat` (tv/telefoon/laptop/naam),
  `overzetten` en `apparaten` (Spotify Connect). Nieuwe tool `tv`: `video` (YouTube; met `YOUTUBE_API_KEY` direct de video),
  `airplay_aan`, `airplay_uit`, via de opdracht **ECO TV** (Shortcuts, "Stel afspeelbestemming in"). Stappen in AI-SETUP.md.
  **Serkan moet die opdracht nog maken.**

## NOVA: brein kiezen (PR #123)
- BEDIENING → **BREIN: ECO | NOVA** (`brein` in config, standaard eco). Bovenin "VERBONDEN MET ECO/NOVA"; oranje + reden als het
  andere brein het overnam. Met NOVA als brein: online uitschrijven met Whisper via ECO (`Eco.uitschrijven`), anders Vosk.

## Controlelijst `/controle` (30 okt, PR #125)
- Gedaan: **B4** workflows naar de nieuwste Node 24-versies, **B5** AI-SETUP.md opgeruimd.
- Nog open: **A** (status nalopen), **B1** Brightspace-robot via de ECO-klok (Serkan moet `GITHUB_DISPATCH_TOKEN` maken),
  **B2** ECO-tests + `eco-tests.yml`, **B3** code-review met beveiliging voorop, **B6** `website-monitor.yml` weg? (gevraagd),
  **C** testvragen (gesteld op 30 okt, antwoorden afwachten), **D** herinneringen (gegeven op 30 okt).

## Vergeten punten (rapport "wat we vergeten zijn", 30 okt)
Genoemd in eerdere chats maar nergens meer vastgelegd:
- **Google-koppeling (Agenda en Gmail):** de code is er al. Serkan zet `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` en
  `GOOGLE_REFRESH_TOKEN` in Supabase (stappen in AI-SETUP.md, "Eenmalig instellen" punt 4). Dan werkt ook het dagrapport,
  zonder Gmail-app-wachtwoord. Levert het meeste op; **Serkan kiest of hij het wil.**
- **Snelheid en quotum bijstellen:** afgesproken om na een paar dagen gebruik te kijken bij LATENTIE. Duurt nadenken te lang of is
  het gratis quotum vaak op, dan gratis bijstellen (modellen/denktijd, eventueel Mistral). Nog nooit op teruggekomen: navragen.
- **Echo via de iPhone-speaker:** onderbreekt ECO zichzelf vaak zonder oortjes, dan de echo-onderdrukking bijstellen. Navragen.
- **Privacy bij het dagrapport:** mail gaat dan via de gratis versies van Google en Groq, die gegevens mogen gebruiken.
  Serkan beslist dit vóór hij het dagrapport aanzet.
- **Betaalde optie:** Claude Sonnet in de slimme baan kost ongeveer €3 à €6 per maand. **Besloten: nu niet betalen.** Wil hij het
  ooit, dan eerst `askClaude` aanpassen: die kapt af bij 1024 tokens en streamt niet.
- **Nieuwe tests (nooit in het echt gezien):** slimme baan ("Waarom is de lucht blauw?": eerst "Nadenken…", dan het antwoord) en de
  systeemcheck bij het opstarten (staat er ergens STORING? Die regel doorgeven).

## NOVA: instellingen, AI-volgorde, indeling en icoon (PR #127)
- BEDIENING bevat alleen **BREIN ECO | NOVA** en **⚙ INSTELLINGEN** (venster met GELUID, BEELD, AI-VOLGORDE, VERBINDING).
- Config: `volume`, `beeld.verberg`, `volgorde` (brein/eco/stem/spraak, `core.volgorde()`), `indeling` (delen van het venster), `magneet`.
  ECO's server volgt `ui.modellen` van NOVA (`volgordeVan`); denkwerk/foto's blijven eerst naar de slimme baan gaan.
- Vrije indeling zoals ECO's site, met magnetisch vastklikken (randen en 14 px ernaast, 10 px vangafstand, hulplijnen).
- App-icoon: `nova/maak_icoon.py` → `ui/nova.ico` → `pyinstaller --icon` (ook het venster, pywebview pakt het exe-icoon).

## Laptop-app onthoudt alles + heet ECO (PR #128)
- `Logboek` (`%APPDATA%\NOVA\geschiedenis.json`): transcript (200), PC-acties (30), gesprek met ECO (`conv`, 12 uur) en N.O.V.A.'s
  gespreksgeheugen; bij de start `herstel`. Venster: plek/grootte/gemaximaliseerd in `cfg.venster` (geminimaliseerd telt niet; niet
  meer op een scherm → gecentreerd). Instellingen → Beeld → TRANSCRIPT WISSEN.
- Hernoemd voor Serkan: app = ECO (titel "ECO — op je laptop", merk E.C.O.), offline brein = N.O.V.A.; documenten in Documenten\ECO.

## 2× klappen = luisteren, vervangt "Hé ECO" (30 okt)
- Serkan: "ik wil niet meer starten met Hé ECO, maar met twee keer klappen". Website én laptop-app.
- Herkenning lokaal (geluid gaat nergens heen): per 10 ms RMS + nuldoorgangen; een klap = plots ≥ 3× harder dan het vorige stukje,
  boven 6× het achtergrondgeluid, veel hoge tonen, binnen 0,15 s terug onder 25% van de piek. Precies twee, 0,15–0,8 s na elkaar,
  in de stilte (geen ander hard geluid ervoor/ertussen/erna; galm van de klap telt niet), 0,35 s wachten op een derde (= applaus).
  Laptop: `nova/nova_klap.py` + `NovaApp.klap_lus` (microfoon alleen open in stand-by, niet tijdens antwoord of praten; cfg `klappen`,
  Instellingen → GELUID, SYSTEEMSTATUS → 2× KLAPPEN). Website: `KlapDetector` in ai.js (zelfde regels), schakelaar BEDIENING →
  2× KLAPPEN (`eco-klap`; standaard aan op de computer, uit op de telefoon), vraagt de microfoon pas na de eerste tik als er nog geen
  toestemming is. Tool `interface` onderdeel `klappen` (oud `he_eco` werkt nog), ook in de laptop-app (`t:"ui"`).
- "Hé Eco" via iOS Spraakopdrachten (Siri-opdracht Start Eco) blijft bestaan; dat is iets van de iPhone zelf.

## Werkmodus: reactor naar rechtsonder + live meekijken (30 okt)
- Serkan (video ROSE): "als ECO bezig is, reactor naar rechtsonder en real-time laten zien waar hij mee bezig is", voor website
  en laptop-app.
- Server: `runToolLive` stuurt per tool `{t:"tool", name, id, info}` en `{t:"tool_klaar", id, ok, ms, uit, bronnen?, url?, voorbeeld?}`
  (`werkInfo`/`werkUitkomst`); slimme baan `nadenken` (id `slim`) ook. Live-tools: het live-antwoord heeft `werk`.
- Website: `werk` in ai.js (FLIP-animatie van `.main-reactor`, kaarten in `#werkLijst`, sluit 9 s na stand-by), schakelaar
  WERKMODUS (`eco-werk`). Laptop: `NovaApp.pc_actie` maakt zelf de kaart + `tool_beeld` (schermplaatje 560 px, 0,8 s na de actie;
  `pc.schermpje_jpeg`), ECO's eigen `pc`-stappen worden daar overgeslagen (`werk_van_eco`); cfg `werkmodus`.
- **Muis:** Serkan zei "het liefst zien waar hij met de muis op klikt". ECO klikt niet zelf (afspraak: geen browser/muis die zelf
  klikt). Wil hij dat toch, dan eerst samen beslissen (risico: verkeerde knop, aankopen, verwijderen); niet zomaar bouwen.

## Karakter: sarcasme en humor (30 okt, MAXCODE)
- Serkan: "af en toe [een grap], en sarcasme mag echt wel vaker, 60/70%, maar alleen goeie grappen, geen robotgrappen".
- `systemPrompt` (ook Live) en N.O.V.A.'s prompt: in ~2 op de 3 antwoorden een droge, sarcastische ondertoon; een echte grap af en
  toe; nooit robotgrappen (circuits, bliep, "als AI"); antwoord eerst, sarcasme hooguit een halve zin; niet bij slecht nieuws,
  stress, ziekte, geld, familie of haast. Test in `tests/functie_test.ts`. Te veel of te weinig? Alleen dat percentage aanpassen.

## Alles wat Serkan zei (sessie 29–30 okt) en de stand
| # | Wens van Serkan | Stand |
|---|---|---|
| 1 | NOVA een Nederlandse stem | ✅ #118 |
| 2 | Skills voor ECO en NOVA (webpagina's, PDF's, documenten) | ✅ #119 |
| 3 | Widget: weer per uur in de hoek, compleet nieuw script | ✅ #120 · Serkan: script één keer opnieuw in Scriptable |
| 4 | "Hij ziet alles als een vraag" ((?) verstond ik niet) | ✅ #121 |
| 5 | Via de iPhone naar AirPlay/tv, Spotify en YouTube op de tv | ✅ #122 · Serkan: opdracht "ECO TV" maken (AI-SETUP.md) |
| 6 | "Verbonden met ECO / N.O.V.A." in plaats van "offline-reserve: qwen", en kunnen wisselen | ✅ #123, #128 |
| 7 | Controlelijst nalopen | ✅ B4, B5 (#125), B1 code (#132, wacht op `GITHUB_DISPATCH_TOKEN`) · B6 wacht op antwoord · B2, B3 open |
| 8 | NOVA hoeft niet automatisch te starten | ✅ vastgelegd, niet meer voorstellen |
| 9 | NOVA vraagt of hij mag bijwerken en doet het bij "ja" meteen | ✅ #126 |
| 10 | Instellingen-knop (geluid, beeld per regel, transcript, AI-volgorde), Windows-icoon, magnetische indeling | ✅ #127 |
| 11 | Alles bewaren na uit/aan | ✅ #128 |
| 12 | Laptop-app heet ECO; offline brein N.O.V.A. | ✅ #128 |
| 13 | Video "How to build Jarvis" handig? | ✅ beoordeeld: niets nieuws; geen extra Groq-accounts, geen stemkloon |
| 14 | Werkmodus zoals ROSE: reactor naar rechtsonder, live zien wat ECO doet | ✅ #131 (website + laptop, schermplaatje na laptop-acties) |
| 15 | "Zien waar hij met de muis op klikt" | ⏸ ECO klikt niet zelf (afspraak); eerst samen beslissen of dat mag |
| 16 | Starten met 2× klappen in plaats van "Hé ECO" | ✅ #129 (website + laptop) |
| 17 | Beste gratis AI, meer gebruik van de beste in plaats van kleine varianten | ✅ #130 (grote modellen eerst, kleine als laatste; Mistral als extra gratis dienst) · Serkan: optioneel `MISTRAL_API_KEY` |
| 18 | Lijst maken, alles nalopen, gemiste punten oppakken | ✅ deze tabel; zie "Nog open" hieronder |

**Nog open (gemist of overgeslagen, op volgorde van nut):**
- **Stand 30 okt avond:** `GITHUB_DISPATCH_TOKEN` staat erin (Serkan); check 31 okt 05:45 of de robot om 05:30 startte.
  PR #140 (modelnamen GROQ/GEMINI, versleepbare lipjes) wachtte nog op CI. Snelle nalooplijst voortaan: `/vergeten`.
- **Gekozen door Serkan (30 okt): 3 en 4.** (3) Dagrapport uit Gmail: Serkan zet `GMAIL_EMAIL` + `GMAIL_APP_PASSWORD`
  (Google-account → Beveiliging → Tweestapsverificatie aan → App-wachtwoorden → "ECO") in Supabase-secrets; privacy: mail
  gaat dan via de gratis Groq/Gemini. (4) Mistral: console.mistral.ai → plan Experiment → API Keys → Create → Supabase-secret
  `MISTRAL_API_KEY` (gratis plan traint op gesprekken). Code is er al; daarna controleren met "welk model gebruik je?".
- **Ideeën (Serkan mag kiezen):** avondoverzicht (21:00 melding met morgen + open taken), studieplanner (leerschema naar toetsen/deadlines).
- **Eigen sleutel voor de laptop (`NOVA_KEY`)** — Serkan: "oké, dat doen we zo" (30 okt). Bouwen: nova-acties (wacht/klaar/
  geheugen) en de pc-tool via Live alleen met `NOVA_KEY` zodra die bestaat; zonder `NOVA_KEY` blijft JARVIS_KEY werken (niets
  stuk). Laptop: veld bij ⚙ Instellingen → Verbinding. Serkan: lange geheime tekst in Supabase-secret `NOVA_KEY` + in de app.
- **Tests + CI (`/controle` B2):** begonnen (PR #133, `tests/`, workflow `eco-tests.yml` op elke PR); uitbreiden met de lijst in
  `/controle` B2 (Web Push, cronTick, lijst/timer/spotify/whatsapp, foto's, planningImport, meer UI).
- **Beveiligingscontrole (`/controle` B3):** gedaan (PR #133, #134, #137; zie `/controle` B3). Open: eigen sleutel voor de laptop-brug
  (nu kan iedereen met JARVIS_KEY de laptop bedienen) — Serkan beslist.
- **Serkan instellen:** `GITHUB_DISPATCH_TOKEN` (robot op tijd), optioneel `MISTRAL_API_KEY`, Google-koppeling of
  `GMAIL_EMAIL`/`GMAIL_APP_PASSWORD` (dagrapport), Brightspace-agendalink in `AGENDA_FEEDS`, merk van de lampen.
- **Serkan testen** (zie "Later"): klappen op de laptop en de site, werkmodus, tv, Live praten, NOVA-stem.
- **Beslissen:** muis-klikken (punt 15), `website-monitor.yml` weg (B6), welke ideeën (studieplanner, avondoverzicht).

## Vervolg na chat 30 okt (klappen, werkmodus, MAXCODE, beveiliging)
**Jij (Serkan) instellen**
- Dagrapport (keuze 3): `GMAIL_EMAIL` + `GMAIL_APP_PASSWORD` in Supabase-secrets (stappen in "Nog open").
- Mistral (keuze 4): `MISTRAL_API_KEY` in Supabase-secrets.
- Laptop-app herstarten → "ja" bij bijwerken (klappen, werkmodus, modelnamen).
- `NOVA_KEY` (eigen laptopsleutel): zodra de laptop er is; dan eerst bouwen (zeg "doe de laptopsleutel").
- Eerder al: widget opnieuw in Scriptable, opdracht "ECO TV" op de iPhone, Brightspace-agendalink in `AGENDA_FEEDS`.
**Jij testen**
- 2× klappen (site + laptop, ook met muziek aan), werkmodus ("zoek de openingstijden van de AH"; laptop: "open Spotify" →
  schermplaatje), Live: sneller? kapt hij je af bij nadenken? (dan `LIVE_STILTE_MS` 800), sarcasme goed zo (2 op 3)?
- Na #139: is "STORING: SERVER · Geen toegang" bij het opstarten weg? Na #140: lipjes slepen, alleen GROQ/GEMINI in beeld.
**Jij beslissen / antwoorden**
- Muis-klikken door ECO (nu niet); `website-monitor.yml` weg (B6)?; merk van de lampen; avondoverzicht of studieplanner?
- Melding als Groq's quotum op is (aangeboden, geen antwoord). Meerdere Groq-accounts: afgewezen (tegen de regels).
- Nooit gevraagd (`/controle` C): start "speel mijn liked songs" vanzelf? vraagt de beginscherm-app nog om de microfoon?
  kwam de briefing om 07:30 en las ECO hem voor? wat zegt ECO op "hoe staat je klok ervoor"? onderbreken, foto's/pdf's,
  archief zoeken, WhatsApp klaarzetten, timer met melding terwijl ECO dicht is.
**Ik (AI) kan zo doen**
- Check 31 okt 05:45: startte ECO's klok de Brightspace-robot om 05:30 (`GITHUB_DISPATCH_TOKEN` staat erin)? Gepland.
- Open PR's #140 (modelnamen, versleepbare lipjes) en #141 (skills /vergeten, /nieuwe-chat) groen krijgen en mergen.
- Tests uitbreiden (`/controle` B2): cronTick-briefing één keer per dag, lijst/timer/spotify-tools, foto's naar Gemini, meer UI.
- Restrisico beveiliging: DNS-rebinding bij web_lezen (fetch kan het IP niet vastzetten); eigen laptopsleutel (zie boven).
- Ideeën zodra Serkan kiest: avondoverzicht (21:00), studieplanner.
**Afspraken uit deze chat**
- Starten met 2× klappen, niet "Hé ECO". Humor: sarcasme ~2 op 3 antwoorden, af en toe een goede grap, nooit robotgrappen.
- Interface toont alleen de dienst (GROQ, GEMINI, MISTRAL, CLAUDE), niet het hele model. Alles altijd opslaan via een PR.
- Startcommando nieuwe chat: "Lees OVERDRACHT.md (vooral 'Vervolg na chat 30 okt') en voer /vergeten uit."

## Later (door Serkan zo afgesproken)
- **Testen door Serkan** (zei "mag later"): Live praten op de iPhone en "oké, stop maar"; in de auto MICROFOON → iPhone
  Microfoon → TEST; "hou het nieuws over de HHS in de gaten" + "maak dat ongedaan"; meekijken (oogknop); briefing met
  "gisteren"; NOVA: "open Spotify", vanaf iPhone "zet het volume van mijn laptop op 30", wifi uit (NOVA neemt het over);
  NOVA-stem (STEM "GEMINI (ECO)" zonder ⚠?); NOVA BREIN ECO/NOVA wisselen; ECO TV/AirPlay (eerst de opdracht "ECO TV" maken);
  slimme baan ("Waarom is de lucht blauw?" → eerst "Nadenken…"); systeemcheck bij opstarten (ergens STORING?);
  2× klappen (laptop en site, ook met muziek aan: telt die niet?); werkmodus ("zoek de openingstijden van de AH" → reactor
  rechtsonder met de stappen; "open Spotify" op de laptop → schermplaatje).
- **Uit de eerste overdracht nog niet bevestigd:** start "speel mijn liked songs" vanzelf? Vraagt de beginscherm-app nog
  steeds om microfoontoestemming?
- **Extra gratis reserve:** Mistral zit erin (30 okt) en doet mee zodra Serkan `MISTRAL_API_KEY` zet (gratis Experiment-plan; traint
  op gesprekken, daarom achter Groq/Gemini). Eerst alle grote modellen, kleine (`RESERVE_MODELS`) pas als laatste. Geen extra
  accounts/sleutels van dezelfde dienst om het quotum te verdubbelen (tegen de regels van Groq/Google). **Geen OmniRoute.**
- **NOVA automatisch laten starten: niet nodig** (Serkan, 30 okt). Hij start NOVA zelf; niet meer voorstellen.
- **Instellen door Serkan:** dagrapport (`GMAIL_EMAIL` + `GMAIL_APP_PASSWORD`), merk van de lampen doorgeven,
  Brightspace-agendalink in `AGENDA_FEEDS`, widget één keer opnieuw installeren in Scriptable (daarna werkt hij zichzelf bij).
- **Ideeën om te bouwen:** studieplanner (leerschema voor toetsen/deadlines), avondoverzicht (melding met morgen + taken).
- **Niet doen:** vertrekwekker, Telegram, Oracle-server, een server huren, het brein lokaal als standaard (cloud is slimmer en gratis).

## Documentatie
AI-SETUP.md (ECO), NOVA.md (NOVA), dit bestand (overdracht).
