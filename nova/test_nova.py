"""Tests voor NOVA zonder Windows: nagebootste ECO-server en Ollama. Draaien: python -m unittest -v test_nova"""
import json
import tempfile
import threading
import unittest
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
                return h.antwoord(200, b"\x00\x01" * 100, "audio/pcm", {"x-audio-rate": "24000"})
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
        pcm, rate = eco.tts("hallo")
        self.assertEqual((len(pcm), rate), (200, 24000))
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
