"""NOVA's oren en stem.

Online: opnemen → ECO (Whisper + antwoord in één verzoek) → ECO's stem (Gemini). Offline: Vosk (Nederlands, op de laptop)
en de stemmen van Windows. Opnemen stopt vanzelf na ongeveer 1,2 s stilte, net als ECO in de browser.
"""
from __future__ import annotations

import io
import json
import threading
import wave
import zipfile
from pathlib import Path

import numpy as np

from nova_core import MAP

RATE = 16000
VOSK_URL = "https://alphacephei.com/vosk/models/vosk-model-small-nl-0.22.zip"
VOSK_MAP = MAP / "vosk-model-small-nl-0.22"


def stilte_detectie(blokken, rate: int = RATE, stilte_s: float = 1.2, max_s: float = 30.0, niets_s: float = 8.0):
    """Verzamelt int16-blokken tot er na spraak `stilte_s` stilte is. Geeft (samples, gesproken).
    De drempel past zich aan het achtergrondgeluid van de eerste 0,4 s aan."""
    alles, vloer, n_vloer, gesproken, stil, t = [], None, 0, False, 0.0, 0.0
    for blok in blokken:
        alles.append(blok)
        d = len(blok) / rate
        t += d
        rms = float(np.sqrt(np.mean((blok.astype(np.float32) / 32768) ** 2))) if len(blok) else 0.0
        if t < 0.4:
            vloer = rms if vloer is None else min(vloer, rms)
            n_vloer += 1
            continue
        drempel = min(0.03, max(0.006, (vloer or 0.0) * 2.5))
        if rms > drempel:
            gesproken, stil = True, 0.0
        elif gesproken:
            stil += d
            if stil >= stilte_s:
                break
        if (not gesproken and t >= niets_s) or t >= max_s:
            break
    return (np.concatenate(alles) if alles else np.zeros(0, np.int16)), gesproken


def opnemen(stop: threading.Event | None = None, apparaat=None):
    """Neemt op tot je stil bent (of tot stop gezet wordt). Geeft int16-samples (16 kHz mono) of None als er niets gezegd is."""
    import sounddevice as sd  # alleen op de laptop nodig
    import queue

    q: "queue.Queue[np.ndarray]" = queue.Queue()

    def cb(indata, frames, tijd, status):
        q.put(indata[:, 0].copy())

    def blokken():
        while not (stop and stop.is_set()):
            try:
                yield q.get(timeout=1)
            except queue.Empty:
                return

    with sd.InputStream(samplerate=RATE, channels=1, dtype="int16", blocksize=1600, callback=cb, device=apparaat):
        samples, gesproken = stilte_detectie(blokken())
    return samples if gesproken else None


def naar_wav(samples: np.ndarray, rate: int = RATE) -> bytes:
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(samples.astype(np.int16).tobytes())
    return buf.getvalue()


def speel_pcm(pcm: bytes, rate: int) -> None:
    import sounddevice as sd
    data = np.frombuffer(pcm[: len(pcm) // 2 * 2], dtype=np.int16).astype(np.float32) / 32768
    sd.play(data, rate)
    sd.wait()


def stop_spelen() -> None:
    try:
        import sounddevice as sd
        sd.stop()
    except Exception:
        pass


# ---------- Offline: Vosk (spraak → tekst) en Windows-stemmen (tekst → spraak) ----------
def vosk_klaar() -> bool:
    return (VOSK_MAP / "am").is_dir() or (VOSK_MAP / "conf").is_dir()


def vosk_downloaden(on_voortgang=None) -> None:
    """Haalt het kleine Nederlandse Vosk-model (~40 MB) één keer op, als je online bent."""
    import requests
    MAP.mkdir(parents=True, exist_ok=True)
    with requests.get(VOSK_URL, stream=True, timeout=60) as r:
        r.raise_for_status()
        totaal, buf = int(r.headers.get("content-length") or 0), io.BytesIO()
        for stuk in r.iter_content(1 << 16):
            buf.write(stuk)
            if on_voortgang and totaal:
                on_voortgang(buf.tell() / totaal)
    with zipfile.ZipFile(buf) as z:
        z.extractall(MAP)


def vosk_herken(samples: np.ndarray) -> str:
    from vosk import KaldiRecognizer, Model  # type: ignore
    global _vosk_model
    try:
        _vosk_model
    except NameError:
        _vosk_model = Model(str(VOSK_MAP))
    rec = KaldiRecognizer(_vosk_model, RATE)
    rec.AcceptWaveform(samples.astype(np.int16).tobytes())
    return json.loads(rec.FinalResult()).get("text", "").strip()


def windows_stem(tekst: str) -> None:
    import ctypes
    import sys
    if sys.platform == "win32":
        try:
            ctypes.windll.ole32.CoInitialize(None)  # pyttsx3 praat via COM, ook vanuit een achtergrondthread
        except Exception:
            pass
    import pyttsx3  # type: ignore
    motor = pyttsx3.init()
    for v in motor.getProperty("voices"):
        if any(s in (v.name + " " + str(getattr(v, "languages", ""))).lower() for s in ("dutch", "nederlands", "nl-nl", "frank", "colette")):
            motor.setProperty("voice", v.id)
            break
    motor.setProperty("rate", 185)
    motor.say(tekst)
    motor.runAndWait()
