"""NOVA — ECO op je Windows-laptop.

Online ("Verbonden") praat NOVA met het ECO-brein (Groq/Gemini, zelfde geheugen, agenda en archief); offline met een model op
de laptop via Ollama. ECO kan de laptop ook vanaf de iPhone bedienen zolang NOVA draait. Start: dubbelklik NOVA.exe.
Zelftest (voor de bouwstraat): NOVA.exe --selftest
"""
from __future__ import annotations

import argparse
import queue
import sys
import tempfile
import threading
import time
import traceback
from pathlib import Path

import nova_core as core
import nova_pc as pc

K = {"bg": "#04090d", "paneel": "#071219", "rand": "#0e3a47", "c": "#00e1ff", "c2": "#9fefff", "muted": "#5b7f8c", "ok": "#5dffb0", "warn": "#ffb12a", "bad": "#ff4d6d"}


class Nova:
    def __init__(self, root):
        import tkinter as tk
        self.tk, self.root = tk, root
        self.cfg = core.laad_config()
        self.ui: "queue.Queue[tuple]" = queue.Queue()
        self.eco = core.Eco(self.cfg)
        self.uitvoeren = pc.maak_uitvoerder(self.beschrijf_beeld)
        self.lokaal = core.Lokaal(self.cfg, self.uitvoeren)
        self.lokaal.kennis = core.laad_kennis()
        self.lokaal_ok, self.lokaal_reden = False, "nog niet gecontroleerd"
        self.brug = core.Brug(self.eco, self.uitvoeren, self.status_info, on_online=self.online_wissel, on_opdracht=self.opdracht_gezien)
        self.conv = None
        self.bezig = False
        self.spreek_slot = threading.Lock()
        self.bouw()
        self.root.after(100, self.verwerk)
        self.brug.start()
        threading.Thread(target=self.lokaal_lus, daemon=True).start()
        self.zeg_sys(f"NOVA {core.VERSIE} gestart op {self.cfg['naam']}.")
        if not self.eco.klaar:
            self.root.after(500, self.instellingen)

    # ---------- venster ----------
    def bouw(self):
        tk = self.tk
        r = self.root
        r.title("NOVA")
        r.geometry("460x680")
        r.minsize(380, 480)
        r.configure(bg=K["bg"])
        kop = tk.Frame(r, bg=K["bg"])
        kop.pack(fill="x", padx=14, pady=(12, 4))
        tk.Label(kop, text="N.O.V.A.", fg=K["c"], bg=K["bg"], font=("Consolas", 22, "bold")).pack(side="left")
        tk.Button(kop, text="⚙", command=self.instellingen, fg=K["c2"], bg=K["paneel"], activebackground=K["rand"], relief="flat", font=("Segoe UI", 12)).pack(side="right")
        self.status = tk.Label(r, text="● VERBINDEN…", fg=K["warn"], bg=K["bg"], font=("Consolas", 10), anchor="w")
        self.status.pack(fill="x", padx=16)
        self.sub = tk.Label(r, text="", fg=K["muted"], bg=K["bg"], font=("Consolas", 9), anchor="w", justify="left", wraplength=420)
        self.sub.pack(fill="x", padx=16, pady=(0, 6))
        self.log = tk.Text(r, bg=K["paneel"], fg="#e9fdff", insertbackground=K["c"], relief="flat", wrap="word", font=("Segoe UI", 11), padx=10, pady=8,
                           highlightthickness=1, highlightbackground=K["rand"])
        self.log.pack(fill="both", expand=True, padx=12)
        for tag, kleur in (("jij", K["warn"]), ("nova", "#e9fdff"), ("sys", K["muted"]), ("pc", K["ok"]), ("fout", K["bad"])):
            self.log.tag_configure(tag, foreground=kleur)
        self.log.configure(state="disabled")
        onder = tk.Frame(r, bg=K["bg"])
        onder.pack(fill="x", padx=12, pady=10)
        self.mic = tk.Button(onder, text="🎙", command=self.mic_klik, fg=K["c"], bg=K["paneel"], activebackground=K["rand"], relief="flat", font=("Segoe UI", 14), width=3)
        self.mic.pack(side="left")
        self.invoer = tk.Entry(onder, bg=K["paneel"], fg="#e9fdff", insertbackground=K["c"], relief="flat", font=("Segoe UI", 11), highlightthickness=1, highlightbackground=K["rand"])
        self.invoer.pack(side="left", fill="x", expand=True, padx=8, ipady=6)
        self.invoer.bind("<Return>", lambda e: self.stuur())
        tk.Button(onder, text="STUUR", command=self.stuur, fg=K["bg"], bg=K["c"], activebackground=K["c2"], relief="flat", font=("Consolas", 10, "bold")).pack(side="left")
        r.bind("<Control-space>", lambda e: self.mic_klik())
        r.protocol("WM_DELETE_WINDOW", self.sluit)

    def verwerk(self):  # alles uit andere threads komt via deze wachtrij in het venster
        try:
            while True:
                soort, *rest = self.ui.get_nowait()
                if soort == "regel":
                    tag, tekst = rest
                    self.log.configure(state="normal")
                    self.log.insert("end", tekst, tag)
                    self.log.see("end")
                    self.log.configure(state="disabled")
                elif soort == "status":
                    tekst, kleur, sub = rest
                    self.status.configure(text=tekst, fg=kleur)
                    self.sub.configure(text=sub)
                elif soort == "mic":
                    self.mic.configure(bg=rest[0])
        except queue.Empty:
            pass
        self.root.after(80, self.verwerk)

    def regel(self, tag, tekst):
        self.ui.put(("regel", tag, tekst))

    def zeg_sys(self, tekst):
        self.regel("sys", f"{core.nu_tijd()}  {tekst}\n")

    def toon_status(self):
        if self.brug.online:
            self.ui.put(("status", "● VERBONDEN — ECO-brein (Groq/Gemini)", K["ok"],
                         f"Offline-reserve: {self.cfg['model']} {'klaar' if self.lokaal_ok else '— ' + self.lokaal_reden}"))
        elif self.lokaal_ok:
            self.ui.put(("status", f"● OFFLINE — eigen brein ({self.cfg['model']})", K["warn"], f"ECO niet bereikbaar: {self.brug.reden}"))
        else:
            self.ui.put(("status", "● OFFLINE — geen brein beschikbaar", K["bad"], f"ECO: {self.brug.reden or 'niet bereikbaar'} · Lokaal: {self.lokaal_reden}"))

    # ---------- verbinding ----------
    def status_info(self):
        return {"naam": self.cfg["naam"], "versie": core.VERSIE, "modus": "online" if self.brug.online else "offline", "model": self.cfg["model"]}

    def online_wissel(self, online, reden):
        self.toon_status()
        if online:
            self.zeg_sys("Verbonden met ECO.")
            self.spreek("Verbonden met ECO.")
            threading.Thread(target=self.kennis_bijwerken, daemon=True).start()
        else:
            self.zeg_sys(f"Offline ({reden}).")
            self.spreek("Offline. Ik gebruik nu mijn eigen brein." if self.lokaal_ok else "Offline, en mijn eigen brein is nog niet klaar.")

    def kennis_bijwerken(self):
        try:
            self.lokaal.kennis = self.eco.geheugen()
            core.bewaar_kennis(self.lokaal.kennis)
        except Exception as e:
            self.zeg_sys(f"Geheugen ophalen lukte niet: {e}")
        try:  # offline spraakherkenning alvast klaarzetten zolang er internet is
            import nova_stem as stem
            if not stem.vosk_klaar():
                stem.vosk_downloaden()
                self.zeg_sys("Offline spraakherkenning (Nederlands) staat klaar.")
        except Exception:
            pass

    def lokaal_lus(self):
        while True:
            self.lokaal_ok, self.lokaal_reden = self.lokaal.status()
            self.toon_status()
            time.sleep(60)

    def opdracht_gezien(self, o):
        args = " ".join(str(v) for v in (o.get("args") or {}).values())
        self.regel("pc", f"{core.nu_tijd()}  ⚙ ECO → {o.get('actie')} {args}\n")

    # ---------- praten ----------
    def stuur(self):
        tekst = self.invoer.get().strip()
        if not tekst or self.bezig:
            return
        self.invoer.delete(0, "end")
        threading.Thread(target=self.vraag, args=(tekst,), daemon=True).start()

    def vraag(self, tekst, al_getoond=False):
        self.bezig = True
        try:
            if not al_getoond:
                self.regel("jij", f"\nJij: {tekst}\n")
            self.regel("nova", "NOVA: ")
            if self.brug.online and self.eco.klaar:
                antwoord, self.conv = self.eco.chat(tekst, self.conv, on_delta=lambda d: self.regel("nova", d), on_tool=self.tool_gezien)
            elif self.lokaal_ok:
                antwoord = self.lokaal.chat(tekst, on_tool=self.tool_gezien)
                self.regel("nova", antwoord)
            else:
                antwoord = "Ik ben offline en mijn eigen brein is nog niet klaar. Installeer Ollama en download het model via ⚙."
                self.regel("fout", antwoord)
            self.regel("nova", "\n")
            self.spreek(antwoord)
        except Exception as e:
            self.regel("fout", f"\n⚠ {e}\n")
        finally:
            self.bezig = False

    def tool_gezien(self, naam):
        self.regel("pc", f" [{naam}] ")

    def mic_klik(self):
        if self.bezig:
            return
        threading.Thread(target=self.luister, daemon=True).start()

    def luister(self):
        import nova_stem as stem
        self.bezig = True
        self.ui.put(("mic", K["warn"]))
        try:
            stem.stop_spelen()
            samples = stem.opnemen()
            self.ui.put(("mic", K["paneel"]))
            if samples is None:
                self.zeg_sys("Ik hoorde niets.")
                return
            if self.brug.online and self.eco.klaar:
                self.regel("nova", "\n")
                gehoord = {"t": ""}

                def heard(t):
                    gehoord["t"] = t
                    self.regel("jij", f"Jij: {t}\n")
                    self.regel("nova", "NOVA: ")
                antwoord, self.conv, _ = self.eco.spraak_chat(stem.naar_wav(samples), self.conv, on_heard=heard, on_delta=lambda d: self.regel("nova", d), on_tool=self.tool_gezien)
                self.regel("nova", "\n")
                self.spreek(antwoord)
            else:
                if not stem.vosk_klaar():
                    self.regel("fout", "\n⚠ Offline spraakherkenning is nog niet gedownload (gebeurt vanzelf als je online bent). Typ je vraag.\n")
                    return
                tekst = stem.vosk_herken(samples)
                if not tekst:
                    self.zeg_sys("Ik verstond niets.")
                    return
                self.regel("jij", f"\nJij: {tekst}\n")
                self.bezig = False
                self.vraag(tekst, al_getoond=True)
        except Exception as e:
            self.regel("fout", f"\n⚠ Microfoon: {e}\n")
        finally:
            self.ui.put(("mic", K["paneel"]))
            self.bezig = False

    def spreek(self, tekst):
        if not self.cfg.get("stem", True) or not tekst:
            return

        def doe():
            import nova_stem as stem
            with self.spreek_slot:
                try:
                    if self.brug.online and self.eco.klaar:
                        pcm, rate = self.eco.tts(tekst[:1500])
                        stem.speel_pcm(pcm, rate)
                        return
                except Exception:
                    pass
                try:
                    stem.windows_stem(tekst[:1500])
                except Exception:
                    pass
        threading.Thread(target=doe, daemon=True).start()

    def beschrijf_beeld(self, jpeg_b64: str) -> str:
        vraag = "Beschrijf kort en concreet wat er op dit scherm staat (programma, belangrijkste tekst)."
        if self.brug.online and self.eco.klaar:
            r = self.eco._post({"message": vraag, "images": [{"mime": "image/jpeg", "data": jpeg_b64}], "ui": {"app": "NOVA"}}, timeout=60).json()
            return r.get("reply", "")
        if self.lokaal_ok:
            return self.lokaal.chat(vraag, beelden=[jpeg_b64])
        return "Ik kan het scherm nu niet bekijken (offline en geen eigen brein)."

    # ---------- instellingen ----------
    def instellingen(self):
        tk = self.tk
        from tkinter import ttk
        w = tk.Toplevel(self.root)
        w.title("NOVA — instellingen")
        w.configure(bg=K["bg"])
        w.geometry("420x420")
        def rij(label, var, verborgen=False, opties=None):
            tk.Label(w, text=label, fg=K["c2"], bg=K["bg"], font=("Consolas", 9), anchor="w").pack(fill="x", padx=14, pady=(10, 2))
            if opties:
                ttk.Combobox(w, textvariable=var, values=opties).pack(fill="x", padx=14)
            else:
                tk.Entry(w, textvariable=var, show="•" if verborgen else "", bg=K["paneel"], fg="#e9fdff", insertbackground=K["c"], relief="flat").pack(fill="x", padx=14, ipady=4)
        sleutel, naam, model = tk.StringVar(value=self.cfg["eco_sleutel"]), tk.StringVar(value=self.cfg["naam"]), tk.StringVar(value=self.cfg["model"])
        stemvar = tk.BooleanVar(value=self.cfg.get("stem", True))
        rij("ECO-SLEUTEL (dezelfde als JARVIS_KEY in Supabase)", sleutel, verborgen=True)
        rij("NAAM VAN DEZE LAPTOP", naam)
        rij("OFFLINE MODEL (Ollama)", model, opties=core.MODELLEN)
        tk.Checkbutton(w, text="NOVA praat hardop", variable=stemvar, fg=K["c2"], bg=K["bg"], selectcolor=K["paneel"], activebackground=K["bg"]).pack(anchor="w", padx=12, pady=8)
        melding = tk.Label(w, text="", fg=K["muted"], bg=K["bg"], font=("Consolas", 9), wraplength=390, justify="left")
        def opslaan():
            self.cfg.update(eco_sleutel=sleutel.get().strip(), naam=naam.get().strip() or self.cfg["naam"], model=model.get().strip() or self.cfg["model"], stem=stemvar.get())
            core.bewaar_config(self.cfg)
            melding.configure(text="Opgeslagen.", fg=K["ok"])
            threading.Thread(target=lambda: (setattr(self, "lokaal_ok", self.lokaal.status()[0]), self.toon_status()), daemon=True).start()
        def download():
            opslaan()
            def doe():
                try:
                    self.lokaal.ophalen(lambda f, s: melding.after(0, lambda: melding.configure(text=f"{self.cfg['model']} downloaden… {f:.0%}", fg=K["warn"])))
                    self.lokaal_ok, self.lokaal_reden = self.lokaal.status()
                    melding.after(0, lambda: melding.configure(text=f"{self.cfg['model']} staat klaar voor offline.", fg=K["ok"]))
                    self.toon_status()
                except Exception as e:
                    melding.after(0, lambda: melding.configure(text=f"Downloaden lukte niet: {e} (draait Ollama? ollama.com)", fg=K["bad"]))
            threading.Thread(target=doe, daemon=True).start()
        knoppen = tk.Frame(w, bg=K["bg"])
        knoppen.pack(fill="x", padx=12, pady=6)
        for tekst, cmd in (("OPSLAAN", opslaan), ("MODEL DOWNLOADEN", download)):
            tk.Button(knoppen, text=tekst, command=cmd, fg=K["bg"], bg=K["c"], relief="flat", font=("Consolas", 9, "bold")).pack(side="left", padx=4)
        melding.pack(fill="x", padx=14, pady=6)

    def sluit(self):
        self.brug.stop()
        self.root.destroy()


def zelftest() -> int:
    """Controle zonder venster, voor de bouwstraat en bij problemen: NOVA.exe --selftest"""
    fouten, regels = 0, []
    def check(naam, f):
        nonlocal fouten
        try:
            uit = f()
            regels.append(f"OK    {naam}: {uit}")
        except Exception as e:
            fouten += 1
            regels.append(f"FOUT  {naam}: {type(e).__name__}: {e}")
    check("versie", lambda: core.VERSIE)
    check("instellingen", lambda: (core.bewaar_config(core.laad_config(Path(tempfile.gettempdir()) / "nova-test.json"), Path(tempfile.gettempdir()) / "nova-test.json"), "lezen/schrijven werkt")[1])
    check("adres", lambda: pc.normaliseer_url("weer in den haag"))
    check("pc-info", lambda: pc.maak_uitvoerder()("info", {}))
    check("bestand zoeken", lambda: (lambda d: (Path(d, "nova_zelftest.txt").write_text("x"), pc.bestand_zoeken("nova_zelftest", [Path(d)]))[1])(tempfile.mkdtemp()))
    check("startmenu", lambda: f"{len(pc.startmenu_snelkoppelingen())} snelkoppelingen")
    check("sse", lambda: list(core.sse_events(['data: {"t":"delta","text":"hoi"}', ""])))
    for mod in ("requests", "numpy", "tkinter", "sounddevice"):  # zonder deze werkt NOVA niet
        check(f"module {mod}", lambda m=mod: (__import__(m), "aanwezig")[1])
    def optioneel(naam, f):  # zonder deze werkt NOVA nog, alleen minder (geen offline stem, volume via toetsen, ...)
        try:
            regels.append(f"OK    {naam}: {f()}")
        except Exception as e:
            regels.append(f"LET OP {naam}: {type(e).__name__}: {e}")
    for mod in ("pyttsx3", "vosk", "PIL", "pycaw.pycaw"):
        optioneel(f"module {mod}", lambda m=mod: (__import__(m), "aanwezig")[1])
    import requests
    optioneel("ECO bereikbaar", lambda: f"HTTP {requests.post(core.ECO_URL, json={}, timeout=15).status_code} (401 = bereikbaar, sleutel nodig)")
    rapport = "\n".join(regels) + f"\n\n{fouten} fout(en)\n"
    try:  # NOVA.exe heeft geen console: het rapport staat ook in %APPDATA%\\NOVA\\zelftest.txt
        core.MAP.mkdir(parents=True, exist_ok=True)
        (core.MAP / "zelftest.txt").write_text(rapport, encoding="utf-8")
    except OSError:
        pass
    if sys.stdout:
        print(rapport)
    return 1 if fouten else 0


def main():
    p = argparse.ArgumentParser(description="NOVA — ECO op je laptop")
    p.add_argument("--selftest", action="store_true")
    a = p.parse_args()
    if a.selftest:
        sys.exit(zelftest())
    import tkinter as tk
    root = tk.Tk()
    try:
        Nova(root)
        root.mainloop()
    except Exception:
        from tkinter import messagebox
        messagebox.showerror("NOVA", traceback.format_exc()[-1500:])


if __name__ == "__main__":
    main()
