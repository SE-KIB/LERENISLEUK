---
description: Snel alles nalopen op vergeten dingen en een lijst maken van wat nog gedaan moet worden (ECO/NOVA), daarna alles opslaan in een PR
argument-hint: [optioneel: alleen "lijst" (niets bouwen) of een onderwerp]
---

Je bent de volgende AI op project ECO (sekibar.nl, repo SE-KIB/LERENISLEUK, `main` = live; laptop-app in `nova/`).
Taak: **snel** nalopen wat vergeten, half af of nog te doen is, en daar één korte lijst van maken. Antwoord Serkan kort en
in het Nederlands, in de vorm "wat ik deed / wat jij moet doen". Beperk je tot $ARGUMENTS als dat is opgegeven.

## 1. Bronnen (alleen lezen, snel)
Je ziet de vorige chat niet; alles wat telt staat in de repo. Lees in deze volgorde:
1. `OVERDRACHT.md`: vooral "Alles wat Serkan zei … en de stand", "Nog open", "Later (door Serkan zo afgesproken)" en
   de regels bovenaan (naamgeving ECO / N.O.V.A., niet bouwen, sleutels nooit in code of chat).
2. `.claude/commands/controle.md`: punten zonder ✅.
3. `git log --oneline -40` en open PR's (GitHub-tools): wat is gestart maar niet gemerged of niet uitgerold?
4. CI van `main`: `eco-tests.yml`, `deploy-function.yml`, `nova-build.yml` groen? (publieke API mag:
   `curl https://api.github.com/repos/SE-KIB/LERENISLEUK/actions/workflows/<bestand>/runs?per_page=2`).
5. `grep -rn "TODO\|FIXME\|nog niet\|later" OVERDRACHT.md AI-SETUP.md NOVA.md` voor losse eindjes.

## 2. Lijst maken
Eén lijst, kort, gegroepeerd, elk punt met wie het moet doen:
- **Jij (Serkan) instellen:** secrets of eenmalige handelingen, met de exacte naam en waar (stappen staan in AI-SETUP.md).
- **Jij testen:** wat gebouwd is maar nooit in het echt gezien.
- **Jij beslissen:** open keuzes.
- **Ik kan meteen bouwen:** dingen zonder input van Serkan, op volgorde van nut.
Geen punten die Serkan heeft afgewezen (zie "Niet bouwen" en "Later" in OVERDRACHT.md). Vraag hem daarna welke hij wil.

## 3. Opslaan (altijd, ook als je alleen een lijst maakte)
- Zet de bijgewerkte lijst in `OVERDRACHT.md` (sectie "Nog open") met de datum.
- Alles via een branch → PR naar `main` → tests groen → mergen. Nooit direct op `main`. Commits eindigen met de
  Co-Authored-By- en Claude-Session-regels uit de systeemmelding; geen modelnamen in commits of PR's.
- `index.html` laadt `ai.js?v=…`/`ai.css?v=…`; de workflow "Update PR version badge" zet die zelf. Krijg je daar een
  conflict, neem dan gewoon één van beide nummers.
