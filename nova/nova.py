"""ECO op je Windows-laptop (het bestand heet NOVA.exe; in de code heet de laptop-app nog NOVA).

Online is ECO "verbonden met ECO" (ECO's brein: Groq/Gemini, zelfde geheugen, agenda en archief); offline "verbonden met N.O.V.A."
(het offline brein: een model op de laptop via Ollama). Serkan kiest zelf; is het gekozen brein niet bereikbaar, dan neemt het andere het over. ECO kan de laptop ook vanaf de iPhone bedienen zolang NOVA draait. Het venster is dezelfde HUD als ECO
(ui/index.html met ECO's ai.css, getoond met WebView2); lukt dat niet, dan een eenvoudig venster. Start: dubbelklik NOVA.exe.
Zelftest (voor de bouwstraat): NOVA.exe --selftest
"""
from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import sys
import tempfile
import threading
import time
import traceback
from pathlib import Path

import nova_core as core
import nova_pc as pc


BREIN_NAAM = {"eco": "ECO", "nova": "N.O.V.A."}  # online heet het brein ECO, offline (op de laptop) N.O.V.A.


class Logboek:
    """Wat NOVA onthoudt tussen sessies (in %APPDATA%\\NOVA\\geschiedenis.json): het transcript, de PC-acties, het gesprek met ECO
    (gaat verder als de laatste vraag minder dan 12 uur geleden was) en het gespreksgeheugen van NOVA's eigen brein."""
    MAX_TRANSCRIPT, MAX_PC, GESPREK_UREN = 200, 30, 12

    def __init__(self, pad: Path | None = None):
        self.pad = pad or core.MAP / "geschiedenis.json"
        self._slot = threading.Lock()
        try:
            self.data = json.loads(self.pad.read_text(encoding="utf-8"))
            if not isinstance(self.data, dict):
                raise ValueError
        except (OSError, ValueError):
            self.data = {}
        for k in ("transcript", "pc", "lokaal"):
            if not isinstance(self.data.get(k), list):
                self.data[k] = []

    def bewaar(self):
        with self._slot:
            try:
                self.pad.parent.mkdir(parents=True, exist_ok=True)
                tmp = self.pad.with_suffix(".tmp")
                tmp.write_text(json.dumps(self.data, ensure_ascii=False), encoding="utf-8")
                tmp.replace(self.pad)  # nooit een half bestand
            except OSError:
                pass

    def regel(self, rol: str, tekst: str):
        if tekst:
            self.data["transcript"] = (self.data["transcript"] + [{"rol": rol, "tekst": str(tekst)[:8000], "tijd": time.strftime("%d-%m %H:%M")}])[-self.MAX_TRANSCRIPT:]
            self.bewaar()

    def pc(self, tekst: str, status: str, detail: str):
        self.data["pc"] = (self.data["pc"] + [{"tekst": tekst, "status": status, "detail": detail, "tijd": time.strftime("%H:%M")}])[-self.MAX_PC:]
        self.bewaar()

    def gesprek(self):
        """Het gesprek met ECO van de vorige keer, als dat niet te oud is."""
        conv, sinds = self.data.get("conv"), float(self.data.get("conv_tijd") or 0)
        return conv if conv and time.time() - sinds < self.GESPREK_UREN * 3600 else None

    def zet_gesprek(self, conv, lokaal: list):
        self.data.update(conv=conv, conv_tijd=time.time(), lokaal=list(lokaal)[-12:])
        self.bewaar()

    def wis(self):
        self.data.update(transcript=[], pc=[], conv=None, lokaal=[])
        self.bewaar()


class OnthoudUI:
    """Zet alles door naar het venster en schrijft het transcript en de PC-acties ook in het logboek."""

    def __init__(self, ui, logboek: Logboek):
        self._ui, self._log = ui, logboek

    def jij(self, t): self._log.regel("user", t); self._ui.jij(t)
    def nova_eind(self, t): self._log.regel("assistant", t); self._ui.nova_eind(t)
    def sys(self, t): self._log.regel("sys", t); self._ui.sys(t)
    def fout(self, t): self._log.regel("fout", t); self._ui.fout(t)
    def pc(self, tekst, status, detail): self._log.pc(tekst, status, detail); self._ui.pc(tekst, status, detail)

    def __getattr__(self, naam):
        return getattr(self._ui, naam)


def venster_geometrie(v: dict, schermen: list, standaard=(1320, 860)) -> dict:
    """Plek en grootte van het venster van de vorige keer, maar alleen als dat nog op een scherm past; anders gecentreerd."""
    breed, hoog = standaard
    if schermen:
        breed, hoog = min(breed, schermen[0].width - 40), min(hoog, schermen[0].height - 80)
    uit = {"width": breed, "height": hoog, "maximized": bool(v.get("max"))}
    try:
        w, h, x, y = int(v["w"]), int(v["h"]), int(v["x"]), int(v["y"])
    except (KeyError, TypeError, ValueError):
        return uit
    for sc in schermen:
        if sc.x <= x + 60 <= sc.x + sc.width and sc.y <= y + 20 <= sc.y + sc.height:  # de titelbalk staat op dit scherm
            uit.update(width=max(900, min(w, sc.width)), height=max(600, min(h, sc.height)), x=x, y=y)
            break
    return uit


class NovaApp:
    """Al het werk van NOVA, los van het venster. `ui` krijgt gebeurtenissen: jij, nova_start, delta, nova_eind, sys, fout,
    tool, pc, status, staat, melding."""

    def __init__(self, ui):
        self.logboek = Logboek()
        self.ui = OnthoudUI(ui, self.logboek)
        self.cfg = core.laad_config()
        self.eco = core.Eco(self.cfg)
        self.uitvoeren = pc.maak_uitvoerder(self.beschrijf_beeld)
        self.lokaal = core.Lokaal(self.cfg, self.pc_actie)
        self.lokaal.kennis = core.laad_kennis()
        self.lokaal_ok, self.lokaal_reden = False, "nog niet gecontroleerd"
        self.brug = core.Brug(self.eco, self.pc_actie, self.status_info, on_online=self.online_wissel)
        self.conv = self.logboek.gesprek()  # het gesprek met ECO gaat verder na een herstart
        self.lokaal.geschiedenis = list(self.logboek.data.get("lokaal", []))[-12:]
        self._venster_klok = None
        self.bezig = False
        self.spreek_slot = threading.Lock()
        self.stem_info = None  # (welke stem sprak, waarom de betere stem niet lukte), voor SYSTEEMSTATUS
        self.stem_gemeld = ""
        self.update_info = None  # een nieuwere NOVA waarvan NOVA vraagt of hij mag bijwerken
        self.update_later_tot = 0.0
        self._update_nu = threading.Event()
        self.klap_fout = ""  # waarom 2× klappen niet werkt (geen microfoon), voor SYSTEEMSTATUS

    def start(self):
        self.ui.herstel({"transcript": self.logboek.data["transcript"], "pc": self.logboek.data["pc"]})  # wat er de vorige keer stond
        self.brug.start()
        threading.Thread(target=self.lokaal_lus, daemon=True).start()
        threading.Thread(target=self.update_lus, daemon=True).start()
        threading.Thread(target=self.klap_lus, daemon=True).start()
        self.ui.sys(f"ECO ({self.versie()}) gestart op {self.cfg['naam']}." + (" Klap 2× om te praten." if self.cfg.get("klappen", True) else ""))
        self.toon_status()

    def stop(self):
        self.brug.stop()

    # ---------- status ----------
    def versie(self):
        import nova_update as upd
        build = upd.huidige_build(ui_map())
        return f"{core.VERSIE}.{build}" if build else core.VERSIE

    def status_info(self):
        return {"naam": self.cfg["naam"], "versie": self.versie(), "modus": "online" if self.brug.online else "offline", "model": self.cfg["model"],
                "brein": self.actief_brein()[0] or "geen"}

    # ---------- welk brein: ECO (cloud) of NOVA (eigen brein op de laptop) ----------
    def gekozen(self) -> str:
        return core.volgorde(self.cfg, "brein")[0]

    def actief_brein(self) -> tuple[str, str]:
        """Het brein dat nu antwoordt ("eco", "nova" of "") en waarom het niet het gekozen brein is (leeg als het dat wel is)."""
        eco_ok, eco_reden = bool(self.brug.online and self.eco.klaar), (self.brug.reden or "niet bereikbaar")
        if self.gekozen() == "nova":
            if self.lokaal_ok:
                return "nova", ""
            return ("eco", f"N.O.V.A. is niet klaar ({self.lokaal_reden})") if eco_ok else ("", f"N.O.V.A.: {self.lokaal_reden} · ECO: {eco_reden}")
        if eco_ok:
            return "eco", ""
        return ("nova", f"ECO is niet bereikbaar ({eco_reden})") if self.lokaal_ok else ("", f"ECO: {eco_reden} · N.O.V.A.: {self.lokaal_reden}")

    def kies_brein(self, keuze: str):
        self.cfg["brein"] = "nova" if keuze == "nova" else "eco"
        self.cfg["volgorde"] = {**(self.cfg.get("volgorde") or {}), "brein": [self.cfg["brein"], "eco" if self.cfg["brein"] == "nova" else "nova"]}
        core.bewaar_config(self.cfg)
        brein, reden = self.actief_brein()
        self.toon_status()
        if brein == self.gekozen():
            self.ui.melding(f"Verbonden met {BREIN_NAAM[brein]}.", "ok")
            self.ui.sys(f"Verbonden met {BREIN_NAAM[brein]}.")
        else:
            self.ui.melding(f"{BREIN_NAAM[self.gekozen()]} gekozen, maar {reden}.", "err")

    def stem_status(self):
        """Welke stem NOVA gebruikt: de laatste die echt sprak (met de reden als hij terugviel), anders de stem die nu aan de beurt is."""
        if self.stem_info:
            naam, reden = self.stem_info
            return {"stem": naam, "stem_reden": reden, "stem_soort": "bad" if naam.startswith("GEEN") else "warn" if reden else "ok"}
        import nova_stem as stem
        if self.brug.online:
            return {"stem": "GEMINI (ECO)", "stem_reden": "", "stem_soort": "ok"}
        if stem.piper_klaar():
            return {"stem": "PIPER (NATHALIE)", "stem_reden": "", "stem_soort": "ok"}
        return {"stem": "NOG NIET GEDOWNLOAD", "stem_reden": "De Nederlandse stem wordt gedownload zodra je online bent.", "stem_soort": "warn"}

    def toon_status(self):
        try:
            import nova_stem as stem
            spraak = "WHISPER (ECO)" if self.brug.online else ("VOSK (OFFLINE)" if stem.vosk_klaar() else "ALLEEN TYPEN")
            stemstatus = self.stem_status()
        except Exception:
            spraak, stemstatus = "—", {}
        brein, reden = self.actief_brein()
        basis = {"eco": "BEREIKBAAR" if self.brug.online else (self.brug.reden or "NIET BEREIKBAAR").upper()[:40], "model": self.cfg["model"],
                 "lokaal": "KLAAR" if self.lokaal_ok else self.lokaal_reden.upper()[:40], "lokaal_ok": self.lokaal_ok, "spraak": spraak,
                 "naam": self.cfg["naam"], "versie": self.versie(), "gekozen": self.gekozen(), "brein": brein, "reden": reden,
                 "brein_volgorde": core.volgorde(self.cfg, "brein"), **stemstatus,
                 "klappen": ("GEEN MICROFOON" if self.klap_fout else "AAN · KLAP 2×") if self.cfg.get("klappen", True) is not False else "UIT",
                 "klappen_reden": self.klap_fout}
        # "modus" bepaalt de kleur: groen = het gekozen brein antwoordt, oranje = het andere nam het over, rood = geen brein.
        modus = "geen" if not brein else "online" if brein == self.gekozen() else "offline"
        titel = f"VERBONDEN MET {BREIN_NAAM[brein]}" if brein else "GEEN BREIN BESCHIKBAAR"
        self.ui.status({**basis, "modus": modus, "titel": titel, "sub": reden or (f"N.O.V.A., het offline brein: {self.cfg['model']} op deze laptop" if brein == "nova" else "ECO online (Groq/Gemini) met je geheugen en agenda")})

    def online_wissel(self, online, reden):
        self.toon_status()
        if online:
            threading.Thread(target=self.kennis_bijwerken, daemon=True).start()
            self._update_nu.set()  # meteen kijken of er een nieuwe NOVA is
            if self.gekozen() == "eco":
                self.ui.sys("Verbonden met ECO.")
                self.spreek("Verbonden met ECO.")
            else:
                self.ui.sys("ECO is bereikbaar (je hebt N.O.V.A. gekozen).")
        else:
            self.ui.sys(f"ECO is niet bereikbaar ({reden}).")
            if self.gekozen() == "eco":
                self.spreek("Geen verbinding. Ik ga verder met Nova, mijn offline brein." if self.lokaal_ok else "Geen verbinding, en Nova, mijn offline brein, is nog niet klaar.")

    def kennis_bijwerken(self):
        try:
            self.lokaal.kennis = self.eco.geheugen()
            core.bewaar_kennis(self.lokaal.kennis)
        except Exception as e:
            self.ui.sys(f"Geheugen ophalen lukte niet: {e}")
        import nova_stem as stem
        try:  # offline spraakherkenning en de Nederlandse stem alvast klaarzetten zolang er internet is
            if not stem.vosk_klaar():
                stem.vosk_downloaden()
                self.ui.sys("Offline spraakherkenning (Nederlands) staat klaar.")
                self.toon_status()
        except Exception:
            pass
        try:
            if not stem.piper_klaar():
                stem.piper_downloaden()
                self.ui.sys("Nederlandse stem voor als ECO's stem niet lukt (Piper, nathalie) staat klaar.")
                self.toon_status()
        except Exception as e:
            self.ui.sys(f"Nederlandse stem downloaden lukte niet: {e}")

    # ---------- bijwerken: zodra NOVA verbonden is kijken, het vragen, en bij "ja" meteen doen ----------
    def update_lus(self):
        if not getattr(sys, "frozen", False):
            return  # ontwikkelen vanuit de broncode: niets bij te werken
        import nova_update as upd
        upd.opruimen(Path(sys.executable))
        while True:
            self._update_nu.wait(3600)  # meteen na verbinden, anders elk uur
            self._update_nu.clear()
            if self.brug.online:
                try:
                    self.update_controleren()
                except Exception as e:
                    self.ui.sys(f"Kijken of er een nieuwe NOVA is lukte niet: {e}")

    def update_controleren(self) -> bool:
        """Is er een nieuwere NOVA? Dan vraagt NOVA het (één keer per versie; na "later" pas na 4 uur weer)."""
        import nova_update as upd
        info = upd.nieuwste()
        if not info or info["build"] <= upd.huidige_build(ui_map()) or time.time() < self.update_later_tot:
            return False
        if self.update_info and self.update_info["build"] >= info["build"]:
            return False  # dat vraagt NOVA al
        self.update_info = info
        self.ui.update(info["tag"], None)
        self.ui.sys(f"Er is een nieuwe versie ({info['tag']}). Nu bijwerken? Kies NU BIJWERKEN of zeg \"ja\" (of \"later\").")
        self.spreek("Er is een nieuwe versie. Zal ik mezelf nu bijwerken?")
        return True

    def update_antwoord(self, ja: bool):
        if not self.update_info:
            return
        if ja:
            threading.Thread(target=self.update_uitvoeren, daemon=True).start()
            return
        self.update_info, self.update_later_tot = None, time.time() + 4 * 3600
        self.ui.update(None, None)
        self.ui.sys("Oké, ik vraag het over een paar uur nog eens.")

    def update_uitvoeren(self):
        import nova_update as upd
        info, self.update_info = self.update_info, None
        if not info:
            return
        if not getattr(sys, "frozen", False):
            self.ui.update(None, None)
            self.ui.sys("Bijwerken kan alleen in NOVA.exe.")
            return
        self.ui.sys(f"Ik werk mezelf bij naar {info['tag']} en start zo opnieuw.")
        t0 = time.time()
        while self.bezig and time.time() - t0 < 60:  # een lopend antwoord eerst afmaken
            time.sleep(0.5)
        try:
            if upd.bijwerken(Path(sys.executable), upd.huidige_build(ui_map()), info, on_voortgang=lambda f: self.ui.update(info["tag"], f)):
                time.sleep(1.0)
                self.stop()
                os._exit(0)
            self.ui.update(None, None)
        except Exception as e:
            self.ui.update(None, None)
            self.ui.fout(f"Bijwerken lukte niet: {e}")

    def update_reactie(self, tekst: str):
        """Wacht NOVA op een antwoord over bijwerken, dan telt "ja"/"doe maar" of "nee"/"later". Geeft True als het dat was."""
        if not self.update_info:
            return False
        t = re.sub(r"[^a-zà-ÿ ]", "", tekst.lower()).strip()
        if re.fullmatch(r"(ja|jazeker|jawel|oké|oke|ok|doe maar|doe het|graag|ja graag|ja doe maar|update|bijwerken|nu bijwerken|ja bijwerken)( nova)?( maar)?", t):
            self.ui.jij(tekst)
            self.update_antwoord(True)
            return True
        if re.fullmatch(r"(nee|nee dank je|nu niet|niet nu|later|straks|nee later)( nova)?", t):
            self.ui.jij(tekst)
            self.update_antwoord(False)
            return True
        return False

    def lokaal_lus(self):
        while True:
            self.lokaal_ok, self.lokaal_reden = self.lokaal.status()
            self.toon_status()
            time.sleep(60)

    # ---------- pc-acties (van ECO via de brug, of van het eigen brein) ----------
    def pc_actie(self, actie, args):
        result = self.uitvoeren(actie, args)
        waarden = [str(v) for k, v in (args or {}).items() if str(v) and v != actie and not (actie == "document_maken" and k == "tekst")]
        tekst = f"{actie.replace('_', ' ')} {' '.join(waarden)}".strip()[:90]
        self.ui.pc(tekst, result.get("status", ""), result.get("controle") or result.get("fout") or "")
        return result

    # ---------- praten ----------
    def stuur(self, tekst):
        tekst = (tekst or "").strip()
        if tekst and not self.bezig and not self.update_reactie(tekst):
            threading.Thread(target=self.vraag, args=(tekst,), daemon=True).start()

    def vraag(self, tekst, al_getoond=False):
        self.bezig = True
        self.ui.staat("thinking")
        try:
            if not al_getoond:
                self.ui.jij(tekst)
            gestart = {"ja": False}

            def delta(d):
                if not gestart["ja"]:
                    gestart["ja"] = True
                    self.ui.nova_start()
                self.ui.delta(d)
            brein, reden = self.actief_brein()
            if brein == "eco":
                antwoord, self.conv = self.eco.chat(tekst, self.conv, on_delta=delta, on_tool=lambda n: self.ui.tool(n), on_ui=self.ui_opdracht)
                self.logboek.zet_gesprek(self.conv, self.lokaal.geschiedenis)
            elif brein == "nova":
                antwoord = self.lokaal.chat(tekst, on_tool=lambda n: self.ui.tool(n))
                self.logboek.zet_gesprek(self.conv, self.lokaal.geschiedenis)
                delta(antwoord)
            else:
                raise RuntimeError(f"Geen brein beschikbaar ({reden}). Voor N.O.V.A. (offline): installeer Ollama en download het model bij Instellingen → AI-volgorde.")
            self.ui.nova_eind(antwoord)
            self.spreek(antwoord)
        except Exception as e:
            self.ui.fout(str(e))
            self.ui.staat("idle")
        finally:
            self.bezig = False

    def mic(self):
        if not self.bezig:
            threading.Thread(target=self.luister, daemon=True).start()

    # ---------- 2× klappen = luisteren (in plaats van "Hé ECO") ----------
    def klap_mag(self) -> bool:
        """Alleen naar klappen luisteren als dat aan staat en ECO niets anders doet (niet tijdens een antwoord of terwijl hij
        praat: dan hoort hij zichzelf niet)."""
        return self.cfg.get("klappen", True) is not False and not self.bezig and not self.spreek_slot.locked()

    def klap_lus(self, rondes=None):
        """Houdt op de achtergrond de microfoon open voor twee klappen. Het geluid blijft op de laptop en wordt meteen vergeten."""
        import nova_klap
        import nova_stem as stem
        while rondes is None or rondes > 0:
            rondes = None if rondes is None else rondes - 1
            if not self.klap_mag():
                time.sleep(0.3)
                continue
            try:
                if self.klap_wacht(nova_klap.KlapDetector(stem.RATE)):
                    self.klap_gehoord()
                if self.klap_fout:
                    self.klap_fout = ""
                    self.toon_status()
            except Exception as e:  # geen microfoon of hij is even bezet: later opnieuw
                if not self.klap_fout:
                    self.klap_fout = f"{type(e).__name__}: {e}"[:120]
                    self.toon_status()
                time.sleep(10)

    def klap_wacht(self, detector) -> bool:
        """Microfoon open tot er twee keer geklapt is (True) of tot ECO iets anders gaat doen (False). Daarna weer dicht."""
        import queue
        import sounddevice as sd
        import nova_stem as stem
        q: "queue.Queue" = queue.Queue(maxsize=200)

        def cb(indata, frames, tijd, status):
            try:
                q.put_nowait(indata[:, 0].copy())
            except queue.Full:
                pass
        with sd.InputStream(samplerate=stem.RATE, channels=1, dtype="int16", blocksize=800, callback=cb):
            while self.klap_mag():
                try:
                    if detector.voed(q.get(timeout=0.5)):
                        return True
                except queue.Empty:
                    continue
        return False

    def ui_opdracht(self, onderdeel: str, aan: bool):
        """ECO's tool "interface" op de laptop: "zet klappen uit", "praat niet hardop"."""
        if onderdeel in ("klappen", "he_eco"):
            self.instellingen({"klappen": aan})
        elif onderdeel == "stem":
            self.instellingen({"stem": aan})
        self.ui.inst(self.inst())

    def klap_gehoord(self):
        if not self.bezig:
            self.ui.sys("👏👏 Ik luister.")
            self.luister()

    def luister(self):
        import nova_stem as stem
        self.bezig = True
        try:
            stem.stop_spelen()
            self.ui.staat("listening")
            samples = stem.opnemen()
            if samples is None:
                self.ui.sys("Ik hoorde niets.")
                self.ui.staat("idle")
                return
            self.ui.staat("thinking")
            if self.update_info:  # NOVA vroeg of hij mag bijwerken: eerst alleen uitschrijven, is het "ja" of "later"?
                tekst = self.eco.uitschrijven(stem.naar_wav(samples)) if self.brug.online and self.eco.klaar else (stem.vosk_herken(samples) if stem.vosk_klaar() else "")
                if tekst and self.update_reactie(tekst):
                    self.ui.staat("idle")
                    return
                if tekst:
                    self.ui.jij(tekst)
                    self.bezig = False
                    self.vraag(tekst, al_getoond=True)
                    return
            whisper_kan = self.brug.online and self.eco.klaar
            if self.actief_brein()[0] == "eco" and core.volgorde(self.cfg, "spraak")[0] == "whisper" and whisper_kan:
                gestart = {"ja": False}  # uitschrijven en antwoorden in één verzoek bij ECO: het snelst

                def delta(d):
                    if not gestart["ja"]:
                        gestart["ja"] = True
                        self.ui.nova_start()
                    self.ui.delta(d)
                antwoord, self.conv, _ = self.eco.spraak_chat(stem.naar_wav(samples), self.conv, on_heard=self.ui.jij, on_delta=delta,
                                                              on_tool=lambda n: self.ui.tool(n), on_ui=self.ui_opdracht)
                self.logboek.zet_gesprek(self.conv, self.lokaal.geschiedenis)
                self.ui.nova_eind(antwoord)
                self.spreek(antwoord)
            else:  # eerst uitschrijven in de gekozen volgorde (Whisper via ECO, Vosk op de laptop), dan het gekozen brein
                tekst = None
                for bron in core.volgorde(self.cfg, "spraak"):
                    try:
                        if bron == "whisper" and whisper_kan:
                            tekst = self.eco.uitschrijven(stem.naar_wav(samples))
                        elif bron == "vosk" and stem.vosk_klaar():
                            tekst = stem.vosk_herken(samples)
                    except Exception:
                        tekst = None
                    if tekst is not None:
                        break
                if tekst is None:
                    raise RuntimeError("Geen spraakherkenning beschikbaar (offline en Vosk nog niet gedownload; dat gebeurt vanzelf als je online bent). Typ je vraag.")
                if not tekst:
                    self.ui.sys("Ik verstond niets.")
                    self.ui.staat("idle")
                    return
                self.ui.jij(tekst)
                self.bezig = False
                self.vraag(tekst, al_getoond=True)
        except Exception as e:
            self.ui.fout(f"Microfoon: {e}")
            self.ui.staat("idle")
        finally:
            self.bezig = False

    def spreek(self, tekst):
        if not self.cfg.get("stem", True) or not tekst:
            self.ui.staat("idle")
            return

        def doe():
            with self.spreek_slot:
                self.ui.staat("speaking")
                try:
                    gebruikt = self.spreek_met_stem(tekst[:1500])
                    if gebruikt:
                        self.stem_gebruikt(*gebruikt)
                except Exception as e:
                    self.stem_gebruikt("GEEN — ALLEEN TEKST", f"{type(e).__name__}: {e}")
                finally:
                    self.ui.staat("idle")  # altijd terug naar stand-by, ook na ECO's stem
        threading.Thread(target=doe, daemon=True).start()

    def spreek_met_stem(self, tekst):
        """Spreekt met de eerste stem uit de gekozen volgorde die werkt (standaard: ECO's stem gestreamd, Piper (nathalie), een
        Nederlandse Windows-stem). Nooit een Engelse stem: dan alleen tekst. Geeft (welke stem sprak, waarom de stemmen ervoor niet
        lukten), of None als je hem onderbrak."""
        import nova_stem as stem
        stem.nieuw_spreken()
        stem.VOLUME = max(0, min(100, int(self.cfg.get("volume", 100)))) / 100
        redenen = []
        for bron in core.volgorde(self.cfg, "stem"):
            if stem.gestopt():
                return None
            if bron == "gemini":
                if not (self.brug.online and self.eco.klaar):
                    redenen.append("offline")
                    continue
                speler = None
                try:
                    rate, r = self.eco.tts_stroom(tekst)
                    with r, stem.Speler(rate) as speler:
                        for stuk in r.iter_content(4800):
                            if not speler.schrijf(stuk):
                                break
                    return "GEMINI (ECO)", "; ".join(redenen)
                except Exception as e:
                    if speler and speler.gespeeld:  # al half uitgesproken: niet opnieuw beginnen met een andere stem
                        return "GEMINI (ECO)", f"ECO's stem viel halverwege weg ({kort(e)})"
                    redenen.append(f"ECO's stem lukte niet ({kort(e)})")
            elif bron == "piper":
                if not stem.piper_klaar():
                    redenen.append("de Nederlandse stem (Piper) is nog niet gedownload; dat gebeurt vanzelf zodra je online bent")
                    continue
                try:
                    stem.piper_spreek(tekst)
                    return "PIPER (NATHALIE)", "; ".join(redenen)
                except Exception as e:
                    redenen.append(f"Piper lukte niet ({kort(e)})")
            elif bron == "windows":
                try:
                    if stem.windows_stem(tekst):
                        return "WINDOWS (NEDERLANDS)", "; ".join(redenen)
                    redenen.append("geen Nederlandse Windows-stem (een Engelse stem gebruik ik niet)")
                except Exception as e:
                    redenen.append(f"Windows-stem lukte niet ({kort(e)})")
        if stem.gestopt():
            return None
        return "GEEN — ALLEEN TEKST", "; ".join(redenen)

    def stem_gebruikt(self, naam, reden):
        """Toont in SYSTEEMSTATUS welke stem sprak, en meldt in het transcript (één keer per reden) waarom hij terugviel."""
        self.stem_info = (naam, reden)
        self.toon_status()
        if reden and reden != self.stem_gemeld:
            self.stem_gemeld = reden
            self.ui.sys(f"Stem: {naam.lower()}. Reden: {reden}.")
        elif not reden:
            self.stem_gemeld = ""

    def beschrijf_beeld(self, jpeg_b64: str) -> str:
        vraag = "Beschrijf kort en concreet wat er op dit scherm staat (programma, belangrijkste tekst)."
        if self.actief_brein()[0] == "eco":
            r = self.eco._post({"message": vraag, "images": [{"mime": "image/jpeg", "data": jpeg_b64}], "ui": {"app": "NOVA"}}, timeout=60).json()
            return r.get("reply", "")
        if self.lokaal_ok:
            return self.lokaal.chat(vraag, beelden=[jpeg_b64])
        return "Ik kan het scherm nu niet bekijken (ECO niet bereikbaar en N.O.V.A. niet klaar)."

    # ---------- instellingen ----------
    INSTELLINGEN = ("volume", "stem", "beeld", "volgorde", "indeling", "magneet", "klappen")

    def inst(self) -> dict:
        """Wat de pagina nodig heeft voor Instellingen (geluid, beeld, AI-volgorde, indeling)."""
        return {"volume": int(self.cfg.get("volume", 100)), "stem": bool(self.cfg.get("stem", True)), "beeld": self.cfg.get("beeld") or {"verberg": []},
                "volgorde": {soort: core.volgorde(self.cfg, soort) for soort in core.VOLGORDES}, "indeling": self.cfg.get("indeling") or {},
                "magneet": self.cfg.get("magneet", True) is not False, "klappen": self.cfg.get("klappen", True) is not False}

    def instellingen(self, patch: dict):
        """Bewaart wat er in Instellingen veranderde (alleen bekende sleutels, gecontroleerd)."""
        p = {k: v for k, v in (patch or {}).items() if k in self.INSTELLINGEN}
        if "volume" in p:
            self.cfg["volume"] = max(0, min(100, int(p["volume"])))
        if "stem" in p:
            self.cfg["stem"] = bool(p["stem"])
        if "magneet" in p:
            self.cfg["magneet"] = bool(p["magneet"])
        if "klappen" in p:
            self.cfg["klappen"] = bool(p["klappen"])
            self.klap_fout = ""
        if isinstance(p.get("beeld"), dict):
            self.cfg["beeld"] = {"verberg": [str(x)[:30] for x in (p["beeld"].get("verberg") or [])][:40]}
        if isinstance(p.get("indeling"), dict):
            self.cfg["indeling"] = {str(k)[:20]: {a: float(v.get(a, 0)) for a in ("x", "y", "w", "h", "z")}
                                    for k, v in p["indeling"].items() if isinstance(v, dict)}
        if isinstance(p.get("volgorde"), dict):
            eigen = dict(self.cfg.get("volgorde") or {})
            for soort, lijst in p["volgorde"].items():
                if soort in core.VOLGORDES and isinstance(lijst, list):
                    eigen[soort] = [str(x) for x in lijst]
            self.cfg["volgorde"] = eigen
            self.cfg["brein"] = core.volgorde(self.cfg, "brein")[0]
        core.bewaar_config(self.cfg)
        if "volgorde" in p or "klappen" in p:
            self.toon_status()

    def test_stem(self):
        self.spreek("Hallo Serkan, zo klink ik nu.")

    def wis_transcript(self):
        self.logboek.wis()
        self.conv = None
        self.lokaal.geschiedenis = []
        self.ui.melding("Transcript gewist; het volgende gesprek begint opnieuw.", "ok")

    # ---------- het venster onthoudt zijn plek, grootte en of het gemaximaliseerd was ----------
    def venster(self, **kw):
        v = dict(self.cfg.get("venster") or {})
        if v.get("max") and "max" not in kw:
            return  # gemaximaliseerd: de gewone grootte niet overschrijven
        if any(isinstance(x, (int, float)) and not isinstance(x, bool) and x <= -10000 for x in kw.values()):
            return  # geminimaliseerd: Windows meldt dan (-32000, -32000)
        v.update({k: (int(x) if k != "max" else bool(x)) for k, x in kw.items()})
        self.cfg["venster"] = v
        if not self._venster_klok:  # tijdens slepen niet elke pixel wegschrijven
            self._venster_klok = threading.Timer(1.0, self.venster_bewaren)
            self._venster_klok.daemon = True
            self._venster_klok.start()

    def venster_bewaren(self):
        self._venster_klok = None
        core.bewaar_config(self.cfg)

    def info(self):
        import nova_update as upd
        build = upd.huidige_build(ui_map())
        return {"modellen": core.MODELLEN, "model": self.cfg["model"], "naam": self.cfg["naam"], "stem": bool(self.cfg.get("stem", True)), "brein": self.gekozen(),
                "inst": self.inst(),
                "heeft_sleutel": self.eco.klaar, "versie": f"{core.VERSIE}.{build}" if build else core.VERSIE}

    def opslaan(self, d: dict):
        if (d.get("eco_sleutel") or "").strip():
            self.cfg["eco_sleutel"] = d["eco_sleutel"].strip()
        self.cfg["naam"] = (d.get("naam") or "").strip() or self.cfg["naam"]
        self.cfg["model"] = (d.get("model") or "").strip() or self.cfg["model"]
        self.cfg["stem"] = bool(d.get("stem", True))
        core.bewaar_config(self.cfg)
        self.ui.melding("Opgeslagen.", "ok")
        threading.Thread(target=lambda: (setattr(self, "lokaal_ok", self.lokaal.status()[0]), self.toon_status()), daemon=True).start()

    def download(self, model: str | None = None):
        if model:
            self.cfg["model"] = model
            core.bewaar_config(self.cfg)

        def doe():
            try:
                self.ui.melding(f"{self.cfg['model']} downloaden…", "")
                self.lokaal.ophalen(lambda f, s: self.ui.melding(f"{self.cfg['model']} downloaden… {f:.0%}", ""))
                self.lokaal_ok, self.lokaal_reden = self.lokaal.status()
                self.ui.melding(f"{self.cfg['model']} staat klaar: N.O.V.A., het offline brein, werkt.", "ok")
                self.toon_status()
            except Exception as e:
                self.ui.melding(f"Downloaden lukte niet: {e} (draait Ollama? ollama.com)", "err")
        threading.Thread(target=doe, daemon=True).start()


def kort(e: Exception) -> str:
    return (str(e) or type(e).__name__)[:160]


# ---------- Venster 1: dezelfde HUD als ECO (WebView2 via pywebview) ----------
def ui_map() -> Path:
    basis = Path(getattr(sys, "_MEIPASS", Path(__file__).resolve().parent))
    ui = basis / "ui"
    if not (ui / "ai.css").exists():  # ontwikkelen vanuit de repo: ECO's ai.css staat een map hoger
        bron = Path(__file__).resolve().parent.parent / "ai.css"
        if bron.exists():
            shutil.copy(bron, ui / "ai.css")
    return ui


class WebUI:
    """Stuurt gebeurtenissen naar de pagina (window.nova.ev); wacht tot de pagina klaar is."""

    def __init__(self):
        self.window = None
        self._wachtrij: list[dict] = []
        self._geladen = False
        self._slot = threading.Lock()

    def _stuur(self, ev):
        with self._slot:
            if not self._geladen:
                self._wachtrij.append(ev)
                return
        self._js(ev)

    def _js(self, ev):
        try:
            self.window.evaluate_js(f"window.nova && window.nova.ev({json.dumps(ev, ensure_ascii=False)})")
        except Exception:
            pass

    def klaar(self):
        with self._slot:
            self._geladen = True
            wachtrij, self._wachtrij = self._wachtrij, []
        for ev in wachtrij:
            self._js(ev)

    def jij(self, t): self._stuur({"t": "jij", "tekst": t})
    def nova_start(self): self._stuur({"t": "nova_start"})
    def delta(self, t): self._stuur({"t": "delta", "tekst": t})
    def nova_eind(self, t): self._stuur({"t": "nova_eind", "tekst": t})
    def sys(self, t): self._stuur({"t": "sys", "tekst": t})
    def fout(self, t): self._stuur({"t": "fout", "tekst": t})
    def tool(self, n): self._stuur({"t": "tool", "tekst": n})
    def pc(self, tekst, status, detail): self._stuur({"t": "pc", "tekst": tekst, "status": status, "detail": detail})
    def status(self, s): self._stuur({"t": "status", **s})
    def staat(self, s): self._stuur({"t": "staat", "s": s})
    def melding(self, t, soort): self._stuur({"t": "melding", "tekst": t, "soort": soort})
    def herstel(self, d): self._stuur({"t": "herstel", **d})
    def update(self, tag, voortgang): self._stuur({"t": "update", "tag": tag, "voortgang": voortgang})
    def inst(self, d): self._stuur({"t": "inst", "inst": d})


class Api:
    """Wat de pagina mag aanroepen (window.pywebview.api.*). Velden met _ ziet de pagina niet."""

    def __init__(self, app: NovaApp, ui: WebUI):
        self._app, self._ui = app, ui

    def stuur(self, tekst): self._app.stuur(tekst)
    def mic(self): self._app.mic()
    def info(self): return self._app.info()
    def opslaan(self, d): self._app.opslaan(d or {})
    def brein(self, keuze): self._app.kies_brein(keuze)
    def instellingen(self, patch): self._app.instellingen(patch or {})
    def test_stem(self): self._app.test_stem()
    def wis_transcript(self): self._app.wis_transcript()
    def download(self, model=None): self._app.download(model)
    def klaar(self): self._ui.klaar()
    def update(self, ja): self._app.update_antwoord(bool(ja))


def start_web(webview) -> None:
    ui = WebUI()
    app = NovaApp(ui)
    try:
        schermen = list(webview.screens)
    except Exception:
        schermen = []
    geo = venster_geometrie(app.cfg.get("venster") or {}, schermen)  # zoals de vorige keer, als het nog past
    venster = webview.create_window("ECO — op je laptop", url=str(ui_map() / "index.html"), js_api=Api(app, ui),
                                    min_size=(900, 600), background_color="#01070c", **geo)
    venster.events.resized += lambda breed, hoog: app.venster(w=breed, h=hoog)
    venster.events.moved += lambda x, y: app.venster(x=x, y=y)
    venster.events.maximized += lambda: app.venster(max=True)
    venster.events.restored += lambda: app.venster(max=False)
    venster.events.closing += app.venster_bewaren
    ui.window = venster
    app.start()
    try:
        webview.start(http_server=True)
    finally:
        app.stop()


# ---------- Venster 2 (reserve): eenvoudig venster als WebView2 ontbreekt ----------
K = {"bg": "#04090d", "paneel": "#071219", "rand": "#0e3a47", "c": "#00e1ff", "c2": "#9fefff", "muted": "#5b7f8c", "ok": "#5dffb0", "warn": "#ffb12a", "bad": "#ff4d6d"}


class TkUI:
    def __init__(self, root):
        import queue
        import tkinter as tk
        self.tk, self.root, self.q = tk, root, queue.Queue()
        root.title("ECO — op je laptop")
        root.geometry(str((core.laad_config().get("venster_eenvoudig") or "460x680")))
        try:
            root.iconbitmap(str(ui_map() / "nova.ico"))
        except Exception:
            pass  # geen icoon (bv. bij ontwikkelen zonder nova.ico): dan het standaardicoon
        root.configure(bg=K["bg"])
        kop = tk.Frame(root, bg=K["bg"])
        kop.pack(fill="x", padx=14, pady=(12, 4))
        tk.Label(kop, text="E.C.O.", fg=K["c"], bg=K["bg"], font=("Consolas", 22, "bold")).pack(side="left")
        tk.Button(kop, text="⚙", command=self.instellingen, fg=K["c2"], bg=K["paneel"], relief="flat", font=("Segoe UI", 12)).pack(side="right")
        self.lbl = tk.Label(root, text="● VERBINDEN…", fg=K["warn"], bg=K["bg"], font=("Consolas", 10), anchor="w")
        self.lbl.pack(fill="x", padx=16)
        self.sub = tk.Label(root, text="", fg=K["muted"], bg=K["bg"], font=("Consolas", 9), anchor="w", justify="left", wraplength=420)
        self.sub.pack(fill="x", padx=16, pady=(0, 6))
        self.log = tk.Text(root, bg=K["paneel"], fg="#e9fdff", relief="flat", wrap="word", font=("Segoe UI", 11), padx=10, pady=8)
        self.log.pack(fill="both", expand=True, padx=12)
        for tag, kleur in (("jij", K["warn"]), ("nova", "#e9fdff"), ("sys", K["muted"]), ("pc", K["ok"]), ("fout", K["bad"])):
            self.log.tag_configure(tag, foreground=kleur)
        self.log.configure(state="disabled")
        onder = tk.Frame(root, bg=K["bg"])
        onder.pack(fill="x", padx=12, pady=10)
        self.micknop = tk.Button(onder, text="🎙", command=lambda: self.app.mic(), fg=K["c"], bg=K["paneel"], relief="flat", font=("Segoe UI", 14), width=3)
        self.micknop.pack(side="left")
        self.invoer = tk.Entry(onder, bg=K["paneel"], fg="#e9fdff", insertbackground=K["c"], relief="flat", font=("Segoe UI", 11))
        self.invoer.pack(side="left", fill="x", expand=True, padx=8, ipady=6)
        self.invoer.bind("<Return>", lambda e: self.verstuur())
        tk.Button(onder, text="STUUR", command=self.verstuur, fg=K["bg"], bg=K["c"], relief="flat", font=("Consolas", 10, "bold")).pack(side="left")
        root.bind("<Control-space>", lambda e: self.app.mic())
        self.app = NovaApp(self)
        def sluiten():
            self.app.cfg["venster_eenvoudig"] = root.geometry().split("+")[0]  # de grootte voor de volgende keer
            core.bewaar_config(self.app.cfg)
            self.app.stop()
            root.destroy()
        root.protocol("WM_DELETE_WINDOW", sluiten)
        root.after(80, self.verwerk)
        self.app.start()
        if not self.app.eco.klaar:
            root.after(500, self.instellingen)

    def verwerk(self):
        import queue
        try:
            while True:
                f = self.q.get_nowait()
                f()
        except queue.Empty:
            pass
        self.root.after(80, self.verwerk)

    def _regel(self, tag, tekst):
        def doe():
            self.log.configure(state="normal")
            self.log.insert("end", tekst, tag)
            self.log.see("end")
            self.log.configure(state="disabled")
        self.q.put(doe)

    def verstuur(self):
        t = self.invoer.get().strip()
        self.invoer.delete(0, "end")
        self.app.stuur(t)

    def jij(self, t): self._regel("jij", f"\nJij: {t}\n")
    def nova_start(self): self._regel("nova", "ECO: ")
    def delta(self, t): self._regel("nova", t)
    def nova_eind(self, t): self._regel("nova", "\n")
    def sys(self, t): self._regel("sys", f"{core.nu_tijd()}  {t}\n")
    def fout(self, t): self._regel("fout", f"\n⚠ {t}\n")
    def tool(self, n): self._regel("pc", f" [{n}] ")
    def pc(self, tekst, status, detail): self._regel("pc", f"{core.nu_tijd()}  ⚙ {tekst} — {status}{' · ' + detail if detail else ''}\n")
    def status(self, s):
        kleur = {"online": K["ok"], "offline": K["warn"]}.get(s["modus"], K["bad"])
        sub = s["sub"] + (f"\nStem: {s['stem']}" if s.get("stem") else "") + (f" — {s['stem_reden']}" if s.get("stem_reden") else "")
        self.q.put(lambda: (self.lbl.configure(text="● " + s["titel"], fg=kleur), self.sub.configure(text=sub)))
    def staat(self, s): self.q.put(lambda: self.micknop.configure(bg=K["warn"] if s == "listening" else K["paneel"]))
    def melding(self, t, soort): self.sys(t)
    def inst(self, d): pass

    def herstel(self, d):
        for r in d.get("transcript", [])[-40:]:
            self._regel({"user": "jij", "assistant": "nova", "fout": "fout"}.get(r["rol"], "sys"), f"{r.get('tijd', '')}  {r['tekst']}\n")
        if d.get("transcript"):
            self._regel("sys", "— vorige sessie —\n")

    def update(self, tag, voortgang):
        if not tag or voortgang is not None:
            if tag and voortgang is not None and voortgang >= 0.999:
                self.sys(f"{tag} gedownload.")
            return
        from tkinter import messagebox
        self.q.put(lambda: self.app.update_antwoord(messagebox.askyesno("ECO", f"Er is een nieuwe versie ({tag}). Nu bijwerken?")))

    def instellingen(self):
        tk = self.tk
        from tkinter import ttk
        w = tk.Toplevel(self.root)
        w.title("ECO — instellingen")
        w.configure(bg=K["bg"])
        i = self.app.info()
        sleutel, naam, model, stemvar = tk.StringVar(), tk.StringVar(value=i["naam"]), tk.StringVar(value=i["model"]), tk.BooleanVar(value=i["stem"])
        for label, var, verborgen in (("ECO-SLEUTEL (leeg = zo laten)", sleutel, True), ("NAAM VAN DEZE LAPTOP", naam, False)):
            tk.Label(w, text=label, fg=K["c2"], bg=K["bg"], font=("Consolas", 9), anchor="w").pack(fill="x", padx=14, pady=(10, 2))
            tk.Entry(w, textvariable=var, show="•" if verborgen else "", bg=K["paneel"], fg="#e9fdff", relief="flat").pack(fill="x", padx=14, ipady=4)
        tk.Label(w, text="N.O.V.A.-MODEL (OLLAMA, OFFLINE)", fg=K["c2"], bg=K["bg"], font=("Consolas", 9), anchor="w").pack(fill="x", padx=14, pady=(10, 2))
        ttk.Combobox(w, textvariable=model, values=i["modellen"]).pack(fill="x", padx=14)
        tk.Checkbutton(w, text="ECO praat hardop", variable=stemvar, fg=K["c2"], bg=K["bg"], selectcolor=K["paneel"]).pack(anchor="w", padx=12, pady=8)
        breinvar = tk.StringVar(value=i["brein"])
        rij = tk.Frame(w, bg=K["bg"])
        rij.pack(fill="x", padx=12)
        tk.Label(rij, text="BREIN", fg=K["c2"], bg=K["bg"], font=("Consolas", 9)).pack(side="left")
        for waarde, label in (("eco", "ECO"), ("nova", "N.O.V.A.")):
            tk.Radiobutton(rij, text=label, value=waarde, variable=breinvar, command=lambda: self.app.kies_brein(breinvar.get()),
                           fg=K["c2"], bg=K["bg"], selectcolor=K["paneel"]).pack(side="left", padx=6)
        knoppen = tk.Frame(w, bg=K["bg"])
        knoppen.pack(fill="x", padx=12, pady=6)
        opslaan = lambda: self.app.opslaan({"eco_sleutel": sleutel.get(), "naam": naam.get(), "model": model.get(), "stem": stemvar.get()})
        tk.Button(knoppen, text="OPSLAAN", command=opslaan, fg=K["bg"], bg=K["c"], relief="flat").pack(side="left", padx=4)
        tk.Button(knoppen, text="MODEL DOWNLOADEN", command=lambda: (opslaan(), self.app.download(model.get())), fg=K["bg"], bg=K["c"], relief="flat").pack(side="left", padx=4)


def start_tk() -> None:
    import tkinter as tk
    root = tk.Tk()
    TkUI(root)
    root.mainloop()


def zelftest() -> int:
    """Controle zonder venster, voor de bouwstraat en bij problemen: NOVA.exe --selftest"""
    fouten, regels = 0, []
    def check(naam, f):
        nonlocal fouten
        try:
            regels.append(f"OK    {naam}: {f()}")
        except Exception as e:
            fouten += 1
            regels.append(f"FOUT  {naam}: {type(e).__name__}: {e}")
    def optioneel(naam, f):  # zonder deze werkt NOVA nog, alleen minder (geen offline stem, volume via toetsen, eenvoudig venster, ...)
        try:
            regels.append(f"OK    {naam}: {f()}")
        except Exception as e:
            regels.append(f"LET OP {naam}: {type(e).__name__}: {e}")
    check("versie", lambda: core.VERSIE)
    check("instellingen", lambda: (core.bewaar_config(core.laad_config(Path(tempfile.gettempdir()) / "nova-test.json"), Path(tempfile.gettempdir()) / "nova-test.json"), "lezen/schrijven werkt")[1])
    check("adres", lambda: pc.normaliseer_url("weer in den haag"))
    check("pc-info", lambda: pc.maak_uitvoerder()("info", {}))
    check("bestand zoeken", lambda: (lambda d: (Path(d, "nova_zelftest.txt").write_text("x"), pc.bestand_zoeken("nova_zelftest", [Path(d)]))[1])(tempfile.mkdtemp()))
    check("startmenu", lambda: f"{len(pc.startmenu_snelkoppelingen())} snelkoppelingen")
    check("sse", lambda: list(core.sse_events(['data: {"t":"delta","text":"hoi"}', ""])))
    check("interface (ECO-HUD)", lambda: ", ".join(f for f in ("index.html", "nova.js", "nova.css", "ai.css") if (ui_map() / f).exists()) or (_ for _ in ()).throw(FileNotFoundError("ui ontbreekt")))
    for mod in ("requests", "numpy", "tkinter", "sounddevice"):  # zonder deze werkt NOVA niet
        check(f"module {mod}", lambda m=mod: (__import__(m), "aanwezig")[1])
    for mod in ("webview", "pyttsx3", "vosk", "piper", "pypdf", "docx", "openpyxl", "pptx", "fpdf", "PIL", "pycaw.pycaw"):
        optioneel(f"module {mod}", lambda m=mod: (__import__(m), "aanwezig")[1])
    import nova_stem as stem
    optioneel("Nederlandse stem (Piper)", stem.piper_proef)
    import nova_doc
    optioneel("documenten (pdf, Word)", lambda: nova_doc.proef(Path(tempfile.mkdtemp())))
    import requests
    optioneel("ECO bereikbaar", lambda: f"HTTP {requests.post(core.ECO_URL, json={}, timeout=15).status_code} (401 = bereikbaar, sleutel nodig)")
    rapport = "\n".join(regels) + f"\n\n{fouten} fout(en)\n"
    try:  # NOVA.exe heeft geen console: het rapport staat ook in %APPDATA%\NOVA\zelftest.txt
        core.MAP.mkdir(parents=True, exist_ok=True)
        (core.MAP / "zelftest.txt").write_text(rapport, encoding="utf-8")
    except OSError:
        pass
    if sys.stdout:
        print(rapport)
    return 1 if fouten else 0


def main():
    p = argparse.ArgumentParser(description="ECO op je laptop (NOVA.exe)")
    p.add_argument("--selftest", action="store_true")
    p.add_argument("--eenvoudig", action="store_true", help="het eenvoudige venster in plaats van de ECO-HUD")
    a = p.parse_args()
    if a.selftest:
        sys.exit(zelftest())
    if not a.eenvoudig:
        try:
            import webview  # WebView2 (Edge) zit in Windows 10/11
            return start_web(webview)
        except Exception:
            core.MAP.mkdir(parents=True, exist_ok=True)
            (core.MAP / "venster-fout.txt").write_text(traceback.format_exc(), encoding="utf-8")
    try:
        start_tk()
    except Exception:
        from tkinter import messagebox
        messagebox.showerror("ECO", traceback.format_exc()[-1500:])


if __name__ == "__main__":
    main()
