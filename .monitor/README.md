# Website monitor

Automatische controle of de live site **sekibar.nl** is gewijzigd.

- `.github/workflows/website-monitor.yml` — draait elk uur op GitHub Actions.
- `last_snapshot.html` — laatst opgehaalde versie van de site.
- `last_hash.txt` — SHA-256 hash van die versie.
- `last_checked.txt` — tijdstip van laatste wijzigingsdetectie (UTC).

Bij een wijziging opent de workflow een issue (met diff) en werkt de snapshot bij.
Je krijgt automatisch een mail via je GitHub-notificaties.

Let op: geplande workflows draaien alleen vanaf de **default branch** (main).
Merge deze branch naar `main` om de uurlijkse controle te activeren.
