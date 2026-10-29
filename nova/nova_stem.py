"""NOVA's oren en stem.

Online: opnemen → ECO (Whisper + antwoord in één verzoek) → ECO's stem (Gemini), afgespeeld terwijl hij binnenkomt.
Offline: Vosk (Nederlands, op de laptop) en Piper met de Vlaamse stem nathalie (goed verstaanbaar, ook op de CPU snel).
Een Windows-stem alleen als die Nederlands is: nooit een Engelse stem voor Nederlandse tekst, dan liever alleen tekst.
Opnemen stopt vanzelf na ongeveer 1,2 s stilte, net als ECO in de browser.
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
# nl_BE-nathalie was 93% verstaanbaar in een Vosk-test (nl_BE-rdh 73%, nl_NL-mls slecht); ~63 MB, 22050 Hz.
PIPER_STEM = "nl_BE-nathalie-medium"
PIPER_URL = "https://huggingface.co/rhasspy/piper-voices/resolve/main/nl/nl_BE/nathalie/medium/"
PIPER_MAP = MAP / "stem"
_stop = threading.Event()


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


class Speler:
    """Speelt 16-bit mono PCM af terwijl hij binnenkomt (ECO's stroom, of Piper zin voor zin). Begint pas na ~0,3 s
    buffer (geen haperingen) en stopt meteen bij stop_spelen(). `gespeeld` = aantal bytes dat al te horen was."""

    def __init__(self, rate: int, buffer_s: float = 0.3):
        self.rate, self.gespeeld, self._rest = rate, 0, b""
        self._buffer = int(rate * buffer_s) * 2
        self._stroom = None

    def __enter__(self):
        return self

    def schrijf(self, data: bytes) -> bool:
        """Geeft False als er gestopt is (dan niets meer sturen)."""
        if _stop.is_set():
            return False
        data = self._rest + data
        if self._stroom is None and len(data) < self._buffer:
            self._rest = data
            return True
        heel = len(data) // 2 * 2  # een stukje kan midden in een sample eindigen
        data, self._rest = data[:heel], data[heel:]
        if self._stroom is None:
            import sounddevice as sd
            self._stroom = sd.RawOutputStream(samplerate=self.rate, channels=1, dtype="int16")
            self._stroom.start()
        stap = self.rate // 10 * 2  # per 0,1 s, zodat stoppen meteen werkt
        for i in range(0, len(data), stap):
            if _stop.is_set():
                return False
            self._stroom.write(data[i:i + stap])
            self.gespeeld += len(data[i:i + stap])
        return True

    def __exit__(self, soort, fout, tb):
        if soort is None and not _stop.is_set() and len(self._rest) >= 2:
            self._buffer, rest, self._rest = 0, self._rest, b""
            self.schrijf(rest)  # korte zin: alles zat nog in de buffer
        if self._stroom is not None:
            if soort is None and not _stop.is_set():
                self._stroom.stop()  # wacht tot alles te horen was
            else:
                self._stroom.abort()
            self._stroom.close()
        return False


def nieuw_spreken() -> None:
    _stop.clear()


def gestopt() -> bool:
    return _stop.is_set()


def stop_spelen() -> None:
    _stop.set()
    try:
        import sounddevice as sd
        sd.stop()
    except Exception:
        pass


# ---------- Offline: Vosk (spraak → tekst), Piper en Nederlandse Windows-stemmen (tekst → spraak) ----------
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


def piper_klaar() -> bool:
    return all((PIPER_MAP / f"{PIPER_STEM}{ext}").is_file() for ext in (".onnx", ".onnx.json"))


def piper_downloaden(on_voortgang=None, url: str = PIPER_URL) -> None:
    """Haalt de Nederlandse stem (~63 MB) één keer op, als je online bent. Eerst als .deel, zodat een halve download nooit telt."""
    import requests
    PIPER_MAP.mkdir(parents=True, exist_ok=True)
    for ext in (".onnx.json", ".onnx"):
        doel = PIPER_MAP / f"{PIPER_STEM}{ext}"
        deel = doel.with_name(doel.name + ".deel")
        with requests.get(f"{url}{PIPER_STEM}{ext}", stream=True, timeout=60) as r:
            r.raise_for_status()
            totaal, binnen = int(r.headers.get("content-length") or 0), 0
            with open(deel, "wb") as f:
                for stuk in r.iter_content(1 << 16):
                    f.write(stuk)
                    binnen += len(stuk)
                    if on_voortgang and totaal and ext == ".onnx":
                        on_voortgang(binnen / totaal)
        deel.replace(doel)


def _piper():
    from piper import PiperVoice  # type: ignore
    global _piper_stem
    try:
        return _piper_stem
    except NameError:
        _piper_stem = PiperVoice.load(str(PIPER_MAP / f"{PIPER_STEM}.onnx"))
        return _piper_stem


def piper_spreek(tekst: str) -> None:
    """Piper maakt de audio zin voor zin (~0,2 s per zin op de CPU), in een eigen thread: de volgende zin is al klaar
    terwijl de vorige nog klinkt, dus geen gaten tussen de zinnen."""
    import queue
    stem = _piper()
    q: "queue.Queue[bytes | Exception | None]" = queue.Queue()

    def maak():
        try:
            for deel in stem.synthesize(tekst):
                if _stop.is_set():
                    break
                q.put(deel.audio_int16_bytes)
        except Exception as e:
            q.put(e)
        finally:
            q.put(None)
    threading.Thread(target=maak, daemon=True, name="nova-piper").start()
    with Speler(stem.config.sample_rate, buffer_s=0) as speler:
        while (pcm := q.get()) is not None:
            if isinstance(pcm, Exception):
                raise pcm
            if not speler.schrijf(pcm):
                return


def piper_proef() -> str:
    """Voor de zelftest: werkt Piper in de exe (met de uitspraakregels van espeak-ng)?"""
    if not piper_klaar():
        from piper.phonemize_espeak import EspeakPhonemizer  # type: ignore
        klanken = EspeakPhonemizer().phonemize("nl", "Hallo Serkan")
        return f"uitspraak werkt ({''.join(klanken[0]).strip()}); stem {PIPER_STEM} nog niet gedownload"
    stem = _piper()
    pcm = b"".join(d.audio_int16_bytes for d in stem.synthesize("Hallo Serkan, alles werkt."))
    return f"{PIPER_STEM}: {len(pcm) / 2 / stem.config.sample_rate:.1f} s audio gemaakt"


def is_nederlands(stem) -> bool:
    tekst = f"{getattr(stem, 'id', '')} {getattr(stem, 'name', '')} {getattr(stem, 'languages', '')}".lower()
    return any(s in tekst for s in ("dutch", "nederlands", "nl-nl", "nl_nl", "nl-be", "nl_be", "_nlnl", "_nlbe"))


def windows_stem(tekst: str) -> bool:
    """Leest voor met een Nederlandse Windows-stem. Geeft False (en zegt niets) als er geen Nederlandse stem is."""
    import ctypes
    import sys
    if sys.platform == "win32":
        try:
            ctypes.windll.ole32.CoInitialize(None)  # pyttsx3 praat via COM, ook vanuit een achtergrondthread
        except Exception:
            pass
    import pyttsx3  # type: ignore
    motor = pyttsx3.init()
    nl = next((v for v in motor.getProperty("voices") if is_nederlands(v)), None)
    if nl is None:
        return False
    motor.setProperty("voice", nl.id)
    motor.setProperty("rate", 185)
    motor.say(tekst)
    motor.runAndWait()
    return True
