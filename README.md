# Çalış Artık Da — Nederlands leren (sekibar.nl)

Interactieve online cursus om Nederlands te leren, in de stijl van een leer-app:
inlogscherm, dashboard met lessen + voortgang, en een quiz-engine met directe
feedback en uitleg. Voor de basisschool en inburgering / NT2.

Statische site (één bestand), gratis gehost via GitHub Pages op **sekibar.nl**.

## Bestanden
- `index.html` — de app (HTML, CSS en de app-logica in JavaScript)
- `lessons.js` — alle lesinhoud (`COURSES`, `SOON`, `QUIZZES`), los van de app
- `scripts/validate-lessons.js` — controleert de vragenbank (draait ook in CI)
- `CNAME` — koppelt sekibar.nl aan GitHub Pages

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
Alle inhoud staat in **`lessons.js`** (los van de app-logica in `index.html`):
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
bovenaan `index.html` leeg zijn, blijft de site gewoon in lokale modus werken.

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
