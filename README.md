# Çalış Artık Da — Nederlands leren (sekibar.nl)

Interactieve online cursus om Nederlands te leren, in de stijl van een leer-app:
inlogscherm, dashboard met lessen + voortgang, en een quiz-engine met directe
feedback en uitleg. Voor de basisschool en inburgering / NT2.

Statische site (één bestand), gratis gehost via GitHub Pages op **sekibar.nl**.

## Bestanden
- `index.html` — de opbouw van de pagina (HTML); verwijst naar de bestanden hieronder
- `styles.css` — alle stijlen/opmaak (het uiterlijk van de site)
- `app.js` — de app-logica (login, quiz-engine, dashboard, docenten-dashboard)
- `lessons.js` — alle lesinhoud (`COURSES`, `SOON`, `QUIZZES`), los van de app
- `sw.js` — service worker: sneller laden + (deels) offline werken (PWA)
- `manifest.webmanifest` — app-manifest voor "toevoegen aan startscherm"
- `scripts/validate-lessons.js` — controleert de vragenbank (draait ook in CI)
- `CNAME` — koppelt sekibar.nl aan GitHub Pages

> Laadvolgorde: `index.html` laadt eerst de Supabase-bibliotheek, dan
> `lessons.js` (de inhoud) en tenslotte `app.js` (de logica). Pas je de
> Supabase-sleutels aan? Die staan bovenaan **`app.js`**.

## Functies
- Inlogscherm met vaste accounts (wachtwoorden als SHA-256-hash; met Supabase gekoppeld gaat login via de database)
- Dashboard met leerlijn, voortgangsbalken, stats, streak, badges en een
  "ga verder waar je gebleven was"-knop
- Vijf spelvormen per les: quiz, invullen, slepen, flitskaarten en mix
- Quiz-engine: directe feedback, uitleg, tip-knop, uitspraak (🔊) en eindscore
- Licht/donker thema (volgt systeem, met knop) en geluidseffecten met aan/uit-knop
- Installeerbaar als app (PWA) met offline app-shell (`sw.js`)
- Contactsectie met e-mail + formulier

## Lessen aanpassen of toevoegen
Alle inhoud staat in **`lessons.js`** (los van de app-logica in `app.js`):
- `COURSES` — de lessen op het dashboard (nummer, titel, omschrijving)
- `QUIZZES` — de vragen per les: `t` = vraag, `o` = antwoorden, `c` = index
  van het juiste antwoord (0 = eerste), `e` = uitleg, `tag` = vraagtype.

Nieuwe les toevoegen? Zet een regel in `COURSES` en voeg een bijpassend blok toe
in `QUIZZES` met hetzelfde lesnummer. Controleer daarna met:

```bash
node scripts/validate-lessons.js
```

Deze check draait ook automatisch bij elke push/PR (GitHub Actions).

## Docenten-dashboard & centrale voortgang (Supabase)
De site houdt voortgang standaard lokaal bij (per apparaat). Voor een echt
docenten-dashboard — waar de docent elke leerling vanaf elk apparaat ziet, tot
op vraagniveau — koppel je een gratis Supabase-database. Zie **`DOCENT-SETUP.md`**
voor de stap-voor-stap handleiding met kant-en-klare SQL. Zolang de sleutels
bovenaan `app.js` leeg zijn, blijft de site gewoon in lokale modus werken.

## Beveiliging — belangrijk om te weten
- **Lokale modus** (geen Supabase-sleutels): de accountlijst met SHA-256-hashes
  bovenaan `app.js` is alléén een *zachte drempel*. Alles draait in de
  browser, dus dit is **geen echte beveiliging** — houd er geen gevoelige
  gegevens achter. Prima voor een oefensite, niet voor iets vertrouwelijks.
- **Cloud-modus** (Supabase gekoppeld): dán zit de echte beveiliging in
  Supabase Auth + de database-regels (RLS). De `anon`-sleutel mag publiek in de
  code staan; gebruik **nooit** de `service_role`-sleutel in de website.
- Wil je een statische site echt afschermen, gebruik dan een dienst als
  Cloudflare Access vóór de pagina.

## Contactformulier activeren
Het formulier staat klaar maar heeft nog een gratis verzend-endpoint nodig
(bijv. [Formspree](https://formspree.io)). Vervang in `index.html` de waarde
`https://formspree.io/f/your-form-id` door je eigen Formspree-URL. Zonder
koppeling verwijst het formulier de bezoeker naar `info@sekibar.nl`.

## GitHub Pages & domein
GitHub Pages staat ingesteld op branch `main`, map `/ (root)`. Het domein
sekibar.nl is gekoppeld via het `CNAME`-bestand en de DNS-records bij de
domeinprovider (4× A-record naar GitHub + CNAME `www` → `se-kib.github.io`).
Na volledige DNS-propagatie kan HTTPS worden afgedwongen in Settings → Pages.
