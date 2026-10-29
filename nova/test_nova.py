"""Tests voor NOVA zonder Windows: nagebootste ECO-server en Ollama. Draaien: python -m unittest -v test_nova"""
import json
import sys
import tempfile
import threading
import types
import unittest
from unittest import mock
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import numpy as np

import nova_core as core
import nova_pc as pc
import nova_stem as stem

GEHEIM = "geheim"


class NepServer:
    """Kleine HTTP-server die ECO's functie of Ollama nabootst."""

    def __init__(self, behandel):
        nep = self

        class H(BaseHTTPRequestHandler):
            def log_message(self, *a):
                pass

            def antwoord(self, code, body, soort="application/json", headers=None):
                data = body if isinstance(body, bytes) else json.dumps(body).encode()
                self.send_response(code)
                self.send_header("content-type", soort)
                for k, v in (headers or {}).items():
                    self.send_header(k, v)
                self.send_header("content-length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)

            def do_GET(self):
                behandel(self, "GET", None)

            def do_POST(self):
                n = int(self.headers.get("content-length") or 0)
                raw = self.rfile.read(n) if n else b""
                try:
                    body = json.loads(raw) if raw and "json" in (self.headers.get("content-type") or "") else raw
                except ValueError:
                    body = raw
                nep.verzoeken.append((self.path, self.headers.get("x-jarvis-key"), body))
                behandel(self, "POST", body)

        self.verzoeken = []
        self.srv = ThreadingHTTPServer(("127.0.0.1", 0), H)
        threading.Thread(target=self.srv.serve_forever, daemon=True).start()
        self.url = f"http://127.0.0.1:{self.srv.server_address[1]}"

    def stop(self):
        self.srv.shutdown()


class TestKern(unittest.TestCase):
    def test_sse(self):
        regels = ['data: {"t":"conv","id":"c1"}', "", 'data: {"t":"delta","text":"Hoi"}', "", 'data: {"t":"done","reply":"Hoi daar"}', ""]
        self.assertEqual([e["t"] for e in core.sse_events(regels)], ["conv", "delta", "done"])

    def test_config(self):
        pad = Path(tempfile.mkdtemp()) / "c.json"
        cfg = core.laad_config(pad)
        self.assertEqual(cfg["model"], "qwen3.5:9b")
        cfg["eco_sleutel"] = "x"
        core.bewaar_config(cfg, pad)
        self.assertEqual(core.laad_config(pad)["eco_sleutel"], "x")


class TestEcoEnBrug(unittest.TestCase):
    def setUp(self):
        self.opdrachten = [{"id": "11111111-2222-3333-4444-555555555555", "actie": "info", "args": {}}]
        self.klaar = []

        def behandel(h, methode, body):
            if h.headers.get("x-jarvis-key") != GEHEIM:
                return h.antwoord(401, {"error": "Geen toegang"})
            if isinstance(body, dict) and "nova" in body:
                nv = body["nova"]
                if nv["actie"] == "wacht":
                    o, self.opdrachten = self.opdrachten, []
                    return h.antwoord(200, {"opdrachten": o})
                if nv["actie"] == "klaar":
                    self.klaar.append(nv)
                    return h.antwoord(200, {"ok": True})
                if nv["actie"] == "geheugen":
                    return h.antwoord(200, {"feiten": ["Serkan studeert aan de HHS"], "agenda": "morgen Water 08:45", "lijstjes": ""})
            if isinstance(body, dict) and "tts" in body:
                return h.antwoord(200, b"\x00\x01" * 100, "audio/l16;rate=24000", {"x-audio-rate": "24000"})
            if isinstance(body, dict) and body.get("stream"):
                sse = "".join(f"data: {json.dumps(e)}\n\n" for e in ({"t": "conv", "id": "conv-1"}, {"t": "tool", "name": "pc"}, {"t": "delta", "text": "Spotify "}, {"t": "delta", "text": "staat aan."}, {"t": "done"}))
                return h.antwoord(200, sse.encode(), "text/event-stream")
            return h.antwoord(400, {"error": "?"})

        self.srv = NepServer(behandel)
        self.cfg = {**core.STANDAARD, "eco_url": self.srv.url, "eco_sleutel": GEHEIM}

    def tearDown(self):
        self.srv.stop()

    def test_chat_stroom(self):
        delen, tools = [], []
        antwoord, conv = core.Eco(self.cfg).chat("open spotify", on_delta=delen.append, on_tool=tools.append)
        self.assertEqual((antwoord, conv, tools), ("Spotify staat aan.", "conv-1", ["pc"]))
        self.assertEqual("".join(delen), "Spotify staat aan.")

    def test_tts_en_geheugen(self):
        eco = core.Eco(self.cfg)
        rate, r = eco.tts_stroom("hallo")
        with r:
            self.assertEqual((len(b"".join(r.iter_content(4800))), rate), (200, 24000))
        self.assertIn("HHS", eco.geheugen()["feiten"][0])

    def test_brug_voert_uit_en_meldt(self):
        gezien, online = [], []
        brug = core.Brug(core.Eco(self.cfg), lambda a, args: {"status": "gedaan", "actie": a}, lambda: {"naam": "test"},
                         on_online=lambda o, r: online.append(o), on_opdracht=gezien.append)
        self.assertEqual(brug.een_ronde(ms=0), 1)
        self.assertEqual(online, [True])
        self.assertEqual(self.klaar[0]["result"], {"status": "gedaan", "actie": "info"})
        self.assertEqual(gezien[0]["actie"], "info")

    def test_brug_kapotte_actie_stopt_niet(self):
        def stuk(a, args):
            raise RuntimeError("kapot")
        brug = core.Brug(core.Eco(self.cfg), stuk, lambda: {})
        brug.een_ronde(ms=0)
        self.assertEqual(self.klaar[0]["result"]["status"], "mislukt")

    def test_verkeerde_sleutel_is_offline(self):
        online = []
        brug = core.Brug(core.Eco({**self.cfg, "eco_sleutel": "fout"}), lambda a, b: {}, lambda: {}, on_online=lambda o, r: online.append((o, r)))
        brug.een_ronde(ms=0)
        self.assertFalse(online[0][0])
        self.assertIn("sleutel", online[0][1])

    def test_geen_server_is_offline(self):
        online = []
        brug = core.Brug(core.Eco({**self.cfg, "eco_url": "http://127.0.0.1:9"}), lambda a, b: {}, lambda: {}, on_online=lambda o, r: online.append(o))
        brug.een_ronde(ms=0)
        self.assertEqual(online, [False])


class TestLokaal(unittest.TestCase):
    def test_tool_lus_met_ollama(self):
        stap = {"n": 0}

        def behandel(h, methode, body):
            if h.path == "/api/tags":
                return h.antwoord(200, {"models": [{"name": "qwen3.5:9b"}]})
            if h.path == "/api/chat":
                stap["n"] += 1
                self.assertFalse(body["think"])
                if stap["n"] == 1:
                    return h.antwoord(200, {"message": {"role": "assistant", "content": "", "tool_calls": [{"function": {"name": "pc", "arguments": {"actie": "info"}}}]}})
                self.assertEqual(body["messages"][-1]["role"], "tool")
                return h.antwoord(200, {"message": {"role": "assistant", "content": "<think>even rekenen</think>Je batterij staat op 80 procent."}})
            return h.antwoord(404, {})

        srv = NepServer(behandel)
        try:
            gedaan = []
            lok = core.Lokaal({**core.STANDAARD, "ollama_url": srv.url}, lambda a, args: (gedaan.append(a), {"status": "gedaan", "batterij": "80%"})[1])
            lok.kennis = {"feiten": ["Serkan studeert aan de HHS"]}
            self.assertEqual(lok.status(), (True, "qwen3.5:9b"))
            self.assertEqual(lok.chat("hoe vol is mijn batterij?"), "Je batterij staat op 80 procent.")
            self.assertEqual(gedaan, ["info"])
            self.assertIn("HHS", lok.systeem())
        finally:
            srv.stop()

    def test_ollama_niet_actief(self):
        ok, reden = core.Lokaal({**core.STANDAARD, "ollama_url": "http://127.0.0.1:9"}, None).status()
        self.assertFalse(ok)
        self.assertIn("Ollama", reden)


class TestPc(unittest.TestCase):
    def test_url(self):
        self.assertEqual(pc.normaliseer_url("youtube"), "https://www.youtube.com")
        self.assertEqual(pc.normaliseer_url("nos.nl"), "https://nos.nl")
        self.assertTrue(pc.normaliseer_url("weer den haag").startswith("https://www.google.com/search?q=weer+den+haag"))

    def test_beste_match(self):
        k = [Path("Spotify.lnk"), Path("Microsoft Word.lnk"), Path("Discord.lnk")]
        self.assertEqual(pc.beste_match("word", k).stem, "Microsoft Word")
        self.assertIsNone(pc.beste_match("photoshop", k))

    def test_bestand_zoeken(self):
        d = Path(tempfile.mkdtemp())
        (d / "verslag water.docx").write_text("x")
        (d / "boodschappen.txt").write_text("x")
        self.assertEqual([p.name for p in pc.bestand_zoeken("verslag", [d])], ["verslag water.docx"])

    def test_onbekende_actie(self):
        self.assertEqual(pc.maak_uitvoerder()("rm -rf", {})["status"], "mislukt")


class TestApp(unittest.TestCase):
    """De logica van het venster (NovaApp) met een nep-venster en een nep-ECO."""

    def test_vraag_stroom(self):
        import nova

        class NepUI:
            def __init__(self):
                self.ev = []

            def __getattr__(self, naam):
                return lambda *a: self.ev.append((naam,) + a)

        ui = NepUI()
        app = nova.NovaApp(ui)
        app.cfg.update(eco_sleutel="x", stem=False)
        app.brug.online = True
        app.eco.chat = lambda t, c, on_delta, on_tool: (on_tool("pc"), on_delta("Spotify "), on_delta("staat aan."), ("Spotify staat aan.", "c1"))[-1]
        app.vraag("open spotify")
        self.assertEqual([e[0] for e in ui.ev], ["staat", "jij", "tool", "nova_start", "delta", "delta", "nova_eind", "staat"])
        self.assertEqual(app.conv, "c1")

    def test_spreken_eindigt_in_stand_by(self):
        ui, app = nep_app(online=True)
        app.eco.tts_stroom = lambda t: (24000, NepAntwoord([b"\x00\x00" * 10]))
        with nep_geluid():
            app.spreek("hallo")
            wacht_op(lambda: ui.ev and ui.ev[-1] == ("staat", "idle"))
        self.assertEqual([e for e in ui.ev if e[0] == "staat"], [("staat", "speaking"), ("staat", "idle")])

    def test_interface_bestanden(self):
        import nova
        ui = nova.ui_map()
        for f in ("index.html", "nova.js", "nova.css"):
            self.assertTrue((ui / f).exists(), f)
        self.assertIn("NICE OPERATING VARIANT AGENT", (ui / "index.html").read_text(encoding="utf-8"))


class NepUI:
    def __init__(self):
        self.ev = []

    def __getattr__(self, naam):
        return lambda *a: self.ev.append((naam,) + a)


def nep_app(online):
    import nova
    ui = NepUI()
    app = nova.NovaApp(ui)
    app.cfg.update(eco_sleutel="x", stem=True)
    app.brug.online = online
    return ui, app


def wacht_op(f, s=2.0):
    import time
    eind = time.time() + s
    while not f() and time.time() < eind:
        time.sleep(0.02)


class NepAntwoord:
    """Een gestreamd antwoord van ECO's stem; `fout` = de stroom breekt na de stukjes af."""

    def __init__(self, stukjes, fout=None):
        self.stukjes, self.fout, self.dicht = stukjes, fout, False

    def iter_content(self, n):
        yield from self.stukjes
        if self.fout:
            raise self.fout

    def __enter__(self):
        return self

    def __exit__(self, *a):
        self.dicht = True


class NepStroom:
    gespeeld = []

    def __init__(self, samplerate, channels, dtype):
        self.rate = samplerate

    def start(self): pass
    def stop(self): pass
    def abort(self): pass
    def close(self): pass

    def write(self, data):
        NepStroom.gespeeld.append(bytes(data))


def nep_geluid():
    NepStroom.gespeeld = []
    return mock.patch.dict(sys.modules, {"sounddevice": types.SimpleNamespace(RawOutputStream=NepStroom, stop=lambda: None)})


class NepMotor:
    def __init__(self, stemmen):
        self.stemmen, self.gezegd, self.instelling = stemmen, [], {}

    def getProperty(self, k): return self.stemmen
    def setProperty(self, k, v): self.instelling[k] = v
    def say(self, t): self.gezegd.append(t)
    def runAndWait(self): pass


def nep_pyttsx3(motor):
    return mock.patch.dict(sys.modules, {"pyttsx3": types.SimpleNamespace(init=lambda: motor)})


ENGELS = types.SimpleNamespace(id=r"HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Speech\Voices\Tokens\TTS_MS_EN-US_ZIRA_11.0", name="Microsoft Zira Desktop - English (United States)", languages=[])
NEDERLANDS = types.SimpleNamespace(id=r"HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Speech\Voices\Tokens\TTS_MS_NL-NL_FRANK_11.0", name="Microsoft Frank - Dutch (Netherlands)", languages=[])


class TestNovaStem(unittest.TestCase):
    """Welke stem NOVA gebruikt: ECO's stem, dan Piper, dan een Nederlandse Windows-stem; nooit een Engelse."""

    def setUp(self):
        stem.nieuw_spreken()

    def test_eco_stem_gestreamd(self):
        ui, app = nep_app(online=True)
        stukjes = [b"\x01" * 4801, b"\x02" * 9599, b"\x03" * 7]  # rare grenzen, midden in samples
        app.eco.tts_stroom = lambda t: (24000, NepAntwoord(stukjes))
        with nep_geluid():
            self.assertEqual(app.spreek_met_stem("hallo"), ("GEMINI (ECO)", ""))
        gespeeld = b"".join(NepStroom.gespeeld)
        self.assertEqual(gespeeld, b"".join(stukjes)[:len(gespeeld)])
        self.assertEqual(len(gespeeld), 14406)  # alles, op het halve sample na
        self.assertTrue(all(len(d) % 2 == 0 for d in NepStroom.gespeeld))

    def test_eco_stem_mislukt_dan_piper(self):
        ui, app = nep_app(online=True)

        def stuk(t):
            raise core.EcoFout("ECO 502: Gemini-stem niet beschikbaar")
        app.eco.tts_stroom = stuk
        gezegd = []
        with mock.patch.object(stem, "piper_klaar", lambda: True), mock.patch.object(stem, "piper_spreek", gezegd.append):
            naam, reden = app.spreek_met_stem("hallo")
            app.stem_gebruikt(naam, reden)
        self.assertEqual((naam, gezegd), ("PIPER (NATHALIE)", ["hallo"]))
        self.assertIn("Gemini-stem niet beschikbaar", reden)
        self.assertEqual(app.stem_status()["stem_soort"], "warn")
        self.assertTrue(any(e[0] == "sys" and "piper" in e[1] for e in ui.ev))

    def test_halverwege_weg_geen_tweede_stem(self):
        ui, app = nep_app(online=True)
        app.eco.tts_stroom = lambda t: (24000, NepAntwoord([b"\x00" * 48000], fout=ConnectionError("stroom brak af")))
        gezegd = []
        with nep_geluid(), mock.patch.object(stem, "piper_klaar", lambda: True), mock.patch.object(stem, "piper_spreek", gezegd.append):
            naam, reden = app.spreek_met_stem("hallo")
        self.assertEqual((naam, gezegd), ("GEMINI (ECO)", []))
        self.assertIn("halverwege", reden)

    def test_nooit_een_engelse_stem(self):
        ui, app = nep_app(online=False)
        motor = NepMotor([ENGELS])
        with nep_pyttsx3(motor), mock.patch.object(stem, "piper_klaar", lambda: False):
            naam, reden = app.spreek_met_stem("Goedemorgen Serkan")
            app.stem_gebruikt(naam, reden)
        self.assertEqual(motor.gezegd, [])
        self.assertEqual(naam, "GEEN — ALLEEN TEKST")
        self.assertIn("gedownload", reden)
        self.assertEqual(app.stem_status()["stem_soort"], "bad")

    def test_nederlandse_windows_stem(self):
        motor = NepMotor([ENGELS, NEDERLANDS])
        with nep_pyttsx3(motor):
            self.assertTrue(stem.windows_stem("hallo"))
        self.assertEqual((motor.gezegd, motor.instelling["voice"]), (["hallo"], NEDERLANDS.id))

    def test_onderbroken_geen_andere_stem(self):
        ui, app = nep_app(online=True)

        def onderbreek(t):
            stem.stop_spelen()
            return 24000, NepAntwoord([b"\x00" * 48000])
        app.eco.tts_stroom = onderbreek
        gezegd = []
        with nep_geluid(), mock.patch.object(stem, "piper_klaar", lambda: True), mock.patch.object(stem, "piper_spreek", gezegd.append):
            app.spreek_met_stem("hallo")
        self.assertEqual((NepStroom.gespeeld, gezegd), ([], []))

    def test_piper_downloaden(self):
        bestanden = {"/nl_BE-nathalie-medium.onnx": b"MODEL" * 1000, "/nl_BE-nathalie-medium.onnx.json": b'{"audio": {"sample_rate": 22050}}'}

        def behandel(h, methode, body):
            return h.antwoord(200, bestanden[h.path], "application/octet-stream") if h.path in bestanden else h.antwoord(404, {})
        srv = NepServer(behandel)
        try:
            with mock.patch.object(stem, "PIPER_MAP", Path(tempfile.mkdtemp()) / "stem"):
                self.assertFalse(stem.piper_klaar())
                voortgang = []
                stem.piper_downloaden(voortgang.append, url=srv.url + "/")
                self.assertTrue(stem.piper_klaar())
                self.assertEqual((stem.PIPER_MAP / "nl_BE-nathalie-medium.onnx").read_bytes(), bestanden["/nl_BE-nathalie-medium.onnx"])
                self.assertEqual(list(stem.PIPER_MAP.glob("*.deel")), [])
                self.assertEqual(voortgang[-1], 1.0)
        finally:
            srv.stop()

    @unittest.skipUnless(__import__("importlib").util.find_spec("piper"), "piper-tts niet geïnstalleerd")
    def test_piper_uitspraak(self):
        with mock.patch.object(stem, "PIPER_MAP", Path(tempfile.mkdtemp())):
            self.assertIn("uitspraak werkt", stem.piper_proef())


class TestUpdate(unittest.TestCase):
    def test_bijwerken(self):
        import hashlib
        import nova_update as upd
        nieuw_exe = b"NIEUWE NOVA" * 100

        def behandel(h, methode, body):
            if h.path == "/latest":
                return h.antwoord(200, {"tag_name": "nova-12", "assets": [{"name": "NOVA.exe", "browser_download_url": srv.url + "/NOVA.exe",
                                                                            "size": len(nieuw_exe), "digest": "sha256:" + hashlib.sha256(nieuw_exe).hexdigest()}]})
            if h.path == "/NOVA.exe":
                return h.antwoord(200, nieuw_exe, "application/octet-stream")
            return h.antwoord(404, {})

        srv = NepServer(behandel)
        try:
            d = Path(tempfile.mkdtemp())
            exe = d / "NOVA.exe"
            exe.write_bytes(b"OUDE NOVA")
            info = upd.nieuwste(srv.url + "/latest")
            self.assertEqual(info["build"], 12)
            self.assertFalse(upd.bijwerken(exe, 12, info, herstart=False))  # al de nieuwste
            self.assertTrue(upd.bijwerken(exe, 3, info, herstart=False))
            self.assertEqual(exe.read_bytes(), nieuw_exe)
            self.assertEqual((d / "NOVA.oud.exe").read_bytes(), b"OUDE NOVA")
            upd.opruimen(exe)
            self.assertFalse((d / "NOVA.oud.exe").exists())
            # verkeerde controlesom: niets vervangen
            info["sha256"] = "0" * 64
            exe.write_bytes(b"HUIDIG")
            with self.assertRaises(RuntimeError):
                upd.bijwerken(exe, 3, info, herstart=False)
            self.assertEqual(exe.read_bytes(), b"HUIDIG")
        finally:
            srv.stop()


class TestStem(unittest.TestCase):
    def blokken(self, *delen):
        for niveau, sec in delen:
            for _ in range(int(sec * 10)):
                yield (np.random.randn(1600) * niveau * 32767).astype(np.int16)

    def test_stopt_na_stilte(self):
        samples, gesproken = stem.stilte_detectie(self.blokken((0.002, 0.5), (0.2, 1.0), (0.002, 3.0)))
        self.assertTrue(gesproken)
        self.assertLess(len(samples) / stem.RATE, 3.0)  # gestopt na ~1,2 s stilte, niet na 4,5 s

    def test_niets_gezegd(self):
        _, gesproken = stem.stilte_detectie(self.blokken((0.002, 9.0)))
        self.assertFalse(gesproken)

    def test_wav(self):
        self.assertEqual(stem.naar_wav(np.zeros(160, np.int16))[:4], b"RIFF")


if __name__ == "__main__":
    unittest.main()
