---
description: Einde van een chat: alles noteren wat in deze chat vergeten of blijven liggen is, opslaan in een PR, en een startcommando voor de nieuwe chat geven
argument-hint: [optioneel: extra punten die Serkan zelf nog wil meegeven]
---

Je bent de AI in de chat die nu wordt afgesloten (project ECO, repo SE-KIB/LERENISLEUK, `main` = live). Serkan opent zo een
nieuwe chat; die ziet deze chat niet. Zorg dat er niets verloren gaat. Antwoord kort en in het Nederlands.

## 1. Deze chat nalopen
Loop de hele chat van begin tot eind door (ook wat er vóór een samenvatting stond, als die er is) en noteer:
- **Gevraagd maar niet (helemaal) gedaan** door Serkan, ook terloops genoemd ("dat doen we zo", "later", "zet op de lijst").
- **Beloofd door jou** ("ik kijk morgen", "ronde 3 doe ik zelf") en geplande check-ins met hun tijd.
- **Open vragen** aan Serkan zonder antwoord.
- **Half af:** PR's die nog open staan of nog niet uitgerold zijn, tests die ontbreken, restrisico's.
- **Wat Serkan nog moet doen:** secrets (exacte naam), eenmalige handelingen, testen, beslissingen.
- **Nieuwe afspraken/voorkeuren** van Serkan (naamgeving, stijl, dingen die hij níet wil).
Neem ook $ARGUMENTS mee.

## 2. Opslaan in de repo (altijd via PR)
- Zet alles in `OVERDRACHT.md` onder een nieuwe kop `## Vervolg na chat <datum>` (kort, per punt wie het doet).
  Afspraken en "niet doen" ook in de vaste secties zetten zodat ze blijven gelden.
- Werk `.claude/commands/controle.md` bij als er punten van die lijst af zijn of bij kwamen.
- Branch → PR naar `main` → CI groen → mergen. Open PR's uit deze chat: eerst groen krijgen en mergen, of in de lijst
  zetten als "open PR #… (wat erin zit)". Commits/PR's met de vaste Co-Authored-By- en Claude-Session-regels, zonder modelnamen.

## 3. Startcommando voor de nieuwe chat
Geef Serkan als laatste één blok om in de nieuwe chat te plakken, zoals:

> Lees OVERDRACHT.md (vooral "Vervolg na chat <datum>") en voer /vergeten uit. Begin daarna met: <belangrijkste eerste stap>.

Kies als eerste stap het punt met het meeste nut dat geen input van Serkan nodig heeft, of anders wat hij zelf als
eerste wil.
