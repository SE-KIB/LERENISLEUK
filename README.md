# Leren is Leuk — sekibar.nl

Website voor bijles & educatie. Statische site, gratis gehost via GitHub Pages,
gekoppeld aan het domein **sekibar.nl**.

## Bestanden
- `index.html` — de website (één pagina met secties)
- `styles.css` — vormgeving (licht + donker thema, responsive)
- `CNAME` — koppelt het domein sekibar.nl aan GitHub Pages

## GitHub Pages aanzetten (eenmalig)
1. Ga in GitHub naar **Settings → Pages**.
2. Bij *Source* kies je **Deploy from a branch**.
3. Kies branch `main` (of de branch die je gemerged hebt) en map `/ (root)`. Klik **Save**.
4. Onder *Custom domain* staat straks automatisch `sekibar.nl` (uit het CNAME-bestand).
   Vink **Enforce HTTPS** aan zodra dat kan.

## Domein koppelen (DNS bij je registrar)
Zet bij je domeinprovider deze records voor **sekibar.nl**:

| Type  | Naam  | Waarde                    |
|-------|-------|---------------------------|
| A     | @     | 185.199.108.153           |
| A     | @     | 185.199.109.153           |
| A     | @     | 185.199.110.153           |
| A     | @     | 185.199.111.153           |
| CNAME | www   | <jouw-github-gebruikersnaam>.github.io |

Het kan tot 24 uur duren voordat DNS actief is. Daarna is de site live op
https://sekibar.nl.

## Lokaal bekijken
Open `index.html` in je browser, of start een simpele server:

```bash
python3 -m http.server 8000
# open http://localhost:8000
```
