"""NOVA bedient de Windows-laptop: alleen vaste, veilige acties (geen vrije opdrachtregel).

Elke actie meldt eerlijk wat er gebeurde: status "gedaan" als NOVA het kon controleren (bv. het programma draait echt),
"niet_gecontroleerd" als het verzoek wel is gedaan maar niet na te gaan (bv. een mediatoets), "mislukt" bij een fout.
"""
from __future__ import annotations

import base64
import ctypes
import io
import os
import re
import subprocess
import sys
import time
import webbrowser
from pathlib import Path
from urllib.parse import quote_plus

WINDOWS = sys.platform == "win32"

# Bekende apps: naam (zoals Serkan hem zegt) → wat Windows kan starten, en het proces om te controleren dat hij draait.
APPS = {
    "spotify": ("spotify:", "spotify.exe"), "chrome": ("chrome", "chrome.exe"), "google chrome": ("chrome", "chrome.exe"),
    "edge": ("msedge", "msedge.exe"), "word": ("winword", "winword.exe"), "excel": ("excel", "excel.exe"),
    "powerpoint": ("powerpnt", "powerpnt.exe"), "outlook": ("outlook", "outlook.exe"), "teams": ("ms-teams:", "ms-teams.exe"),
    "discord": ("discord:", "discord.exe"), "whatsapp": ("whatsapp:", "whatsapp.exe"), "steam": ("steam:", "steam.exe"),
    "verkenner": ("explorer", "explorer.exe"), "rekenmachine": ("calc", "calculatorapp.exe"), "kladblok": ("notepad", "notepad.exe"),
    "instellingen": ("ms-settings:", "systemsettings.exe"), "store": ("ms-windows-store:", "winstore.app.exe"),
    "taakbeheer": ("taskmgr", "taskmgr.exe"), "paint": ("mspaint", "mspaint.exe"), "vs code": ("code", "code.exe"), "code": ("code", "code.exe"),
}
SITES = {"youtube": "https://www.youtube.com", "brightspace": "https://brightspace.hhs.nl", "eco": "https://sekibar.nl", "gmail": "https://mail.google.com",
         "netflix": "https://www.netflix.com", "google": "https://www.google.com", "chatgpt": "https://chatgpt.com", "github": "https://github.com"}


def com() -> None:
    """Windows-onderdelen als het volume werken via COM; elke thread (bv. de brug) moet dat eerst aanzetten."""
    if WINDOWS:
        try:
            ctypes.windll.ole32.CoInitialize(None)  # type: ignore[attr-defined]
        except Exception:
            pass


def resultaat(status: str, **velden) -> dict:
    return {"status": status, **velden}


def normaliseer_url(url: str) -> str:
    u = url.strip()
    if not u:
        return ""
    if u.lower() in SITES:
        return SITES[u.lower()]
    if re.match(r"^https?://", u, re.I):
        return u
    if re.match(r"^[\w-]+(\.[\w-]+)+(/.*)?$", u):
        return "https://" + u
    return "https://www.google.com/search?q=" + quote_plus(u)


def processen() -> set[str]:
    if not WINDOWS:
        return set()
    try:
        uit = subprocess.run(["tasklist", "/fo", "csv", "/nh"], capture_output=True, text=True, timeout=8, creationflags=0x08000000).stdout
    except (OSError, subprocess.SubprocessError):
        return set()
    return {regel.split('","')[0].strip('"').lower() for regel in uit.splitlines() if regel}


def startmenu_snelkoppelingen() -> list[Path]:
    mappen = [Path(os.environ.get("PROGRAMDATA", r"C:\ProgramData")) / r"Microsoft\Windows\Start Menu\Programs",
              Path(os.environ.get("APPDATA", "")) / r"Microsoft\Windows\Start Menu\Programs"]
    return [p for m in mappen if m.is_dir() for p in m.rglob("*.lnk")]


def beste_match(naam: str, kandidaten: list[Path]) -> Path | None:
    n = naam.lower().strip()
    if not n:
        return None
    score = lambda p: (p.stem.lower() == n) * 3 + p.stem.lower().startswith(n) * 2 + (n in p.stem.lower())
    beste = max(kandidaten, key=score, default=None)
    return beste if beste is not None and score(beste) > 0 else None


def app_openen(naam: str) -> dict:
    if not WINDOWS:
        return resultaat("mislukt", fout="apps openen kan alleen op Windows")
    n = naam.lower().strip()
    doel, proces = APPS.get(n, (None, None))
    if doel is None:
        lnk = beste_match(n, startmenu_snelkoppelingen())
        if lnk is None:
            return resultaat("mislukt", fout=f"geen app gevonden die '{naam}' heet")
        doel, proces = str(lnk), None
    voor = processen()
    try:
        os.startfile(doel)  # type: ignore[attr-defined]
    except OSError as e:
        return resultaat("mislukt", fout=f"'{naam}' starten lukte niet: {e}")
    if proces:
        for _ in range(10):  # tot 5 s kijken of het programma echt draait
            if proces in processen():
                return resultaat("gedaan", geopend=naam, controle=f"{proces} draait" + (" (stond al open)" if proces in voor else ""))
            time.sleep(0.5)
        return resultaat("niet_gecontroleerd", geopend=naam, controle=f"gestart, maar {proces} zie ik (nog) niet draaien")
    return resultaat("niet_gecontroleerd", geopend=naam, controle=f"snelkoppeling '{Path(doel).stem}' gestart")


def website_openen(url: str) -> dict:
    u = normaliseer_url(url)
    if not u:
        return resultaat("mislukt", fout="welke website?")
    ok = webbrowser.open(u)
    return resultaat("niet_gecontroleerd" if ok else "mislukt", geopend=u, controle="de browser is gevraagd de pagina te openen")


# Toetsen via Windows (mediatoetsen en volume), zonder extra pakketten.
VK = {"afspelen": 0xB3, "pauze": 0xB3, "volgende": 0xB0, "vorige": 0xB1, "harder": 0xAF, "zachter": 0xAE, "dempen": 0xAD}


def toets(vk: int, keer: int = 1) -> None:
    for _ in range(keer):
        ctypes.windll.user32.keybd_event(vk, 0, 0, 0)  # type: ignore[attr-defined]
        ctypes.windll.user32.keybd_event(vk, 0, 2, 0)  # type: ignore[attr-defined]


def eindpunt():
    """Het volume van de luidsprekers via pycaw (nieuwe versies: .EndpointVolume, oude: via Activate)."""
    com()
    from pycaw.pycaw import AudioUtilities  # type: ignore
    sp = AudioUtilities.GetSpeakers()
    ev = getattr(sp, "EndpointVolume", None)
    if ev is not None:
        return ev
    from comtypes import CLSCTX_ALL  # type: ignore
    from pycaw.pycaw import IAudioEndpointVolume  # type: ignore
    return ctypes.cast(sp.Activate(IAudioEndpointVolume._iid_, CLSCTX_ALL, None), ctypes.POINTER(IAudioEndpointVolume))


def volume_lezen():
    try:
        return round(eindpunt().GetMasterVolumeLevelScalar() * 100)
    except Exception:
        return None


def media(opdracht: str) -> dict:
    if not WINDOWS:
        return resultaat("mislukt", fout="alleen op Windows")
    o = opdracht.lower().strip()
    if o not in ("afspelen", "pauze", "volgende", "vorige"):
        return resultaat("mislukt", fout="kan: afspelen, pauze, volgende, vorige")
    toets(VK[o])
    return resultaat("niet_gecontroleerd", media=o, controle="mediatoets gegeven; of de speler reageert kan NOVA niet zien")


def volume(opdracht: str) -> dict:
    if not WINDOWS:
        return resultaat("mislukt", fout="alleen op Windows")
    o = opdracht.lower().strip()
    com()
    if re.fullmatch(r"\d{1,3}", o):
        doel = max(0, min(100, int(o)))
        try:
            eindpunt().SetMasterVolumeLevelScalar(doel / 100, None)
        except Exception:
            toets(VK["zachter"], 50)  # zonder pycaw: eerst helemaal zacht, dan in stappen van 2% omhoog
            toets(VK["harder"], doel // 2)
    elif o in ("harder", "zachter"):
        toets(VK[o], 5)  # ongeveer 10%
    elif o in ("dempen", "stil", "mute"):
        toets(VK["dempen"])
    else:
        return resultaat("mislukt", fout="volume: een getal 0-100, harder, zachter of dempen")
    nu = volume_lezen()
    return resultaat("gedaan" if nu is not None else "niet_gecontroleerd", volume=nu if nu is not None else o,
                     controle=f"volume staat nu op {nu}%" if nu is not None else "volumetoetsen gegeven")


def typen(tekst: str) -> dict:
    if not WINDOWS:
        return resultaat("mislukt", fout="alleen op Windows")
    if not tekst:
        return resultaat("mislukt", fout="welke tekst?")

    class KEYBDINPUT(ctypes.Structure):
        _fields_ = [("wVk", ctypes.c_ushort), ("wScan", ctypes.c_ushort), ("dwFlags", ctypes.c_ulong), ("time", ctypes.c_ulong), ("dwExtraInfo", ctypes.c_size_t)]

    class INPUT(ctypes.Structure):
        class _U(ctypes.Union):
            _fields_ = [("ki", KEYBDINPUT), ("pad", ctypes.c_byte * 32)]
        _anonymous_ = ("u",)
        _fields_ = [("type", ctypes.c_ulong), ("u", _U)]

    for ch in tekst[:2000]:
        for flags in (0x0004, 0x0004 | 0x0002):  # KEYEVENTF_UNICODE, + KEYUP
            inp = INPUT(type=1)
            inp.ki = KEYBDINPUT(0, ord(ch), flags, 0, 0)
            ctypes.windll.user32.SendInput(1, ctypes.byref(inp), ctypes.sizeof(INPUT))  # type: ignore[attr-defined]
    return resultaat("niet_gecontroleerd", getypt=len(tekst), controle="getypt in het venster dat voor stond")


def zoekmappen() -> list[Path]:
    h = Path.home()
    return [p for p in (h / "Desktop", h / "Documents", h / "Downloads", h / "Pictures", h / "Videos", h / "Music", h / "OneDrive") if p.is_dir()]


def bestand_zoeken(naam: str, mappen: list[Path] | None = None, max_s: float = 4.0) -> list[Path]:
    n = naam.lower().strip()
    if not n:
        return []
    tot, gevonden = time.monotonic() + max_s, []
    for m in mappen or zoekmappen():
        for wortel, dirs, files in os.walk(m):
            dirs[:] = [d for d in dirs if not d.startswith((".", "node_modules", "AppData"))]
            gevonden += [Path(wortel) / f for f in files if n in f.lower()]
            if time.monotonic() > tot or len(gevonden) >= 50:
                break
    return sorted(gevonden, key=lambda p: (p.stem.lower() != n, -p.stat().st_mtime if p.exists() else 0))[:10]


# Alleen documenten en media openen, nooit iets dat code uitvoert (.exe, .bat, .lnk, .ps1, ...): een bestandsnaam kan uit
# een mail of webpagina komen, en dan mag een "open factuur" nooit een programma starten.
VEILIG_OPENEN = {".pdf", ".docx", ".doc", ".odt", ".rtf", ".txt", ".md", ".csv", ".xlsx", ".xls", ".ods", ".pptx", ".ppt", ".odp",
                 ".jpg", ".jpeg", ".png", ".gif", ".webp", ".heic", ".bmp", ".mp3", ".m4a", ".wav", ".flac", ".mp4", ".mov", ".mkv", ".avi", ".webm"}


def bestand_openen(naam: str) -> dict:
    alle = bestand_zoeken(naam)
    hits = [p for p in alle if p.suffix.lower() in VEILIG_OPENEN]
    if not hits:
        if alle:
            return resultaat("mislukt", fout=f"'{alle[0].name}' open ik niet: alleen documenten, foto's, muziek en video, geen programma's of snelkoppelingen")
        return resultaat("mislukt", fout=f"geen bestand gevonden met '{naam}' in de naam")
    if not WINDOWS:
        return resultaat("mislukt", fout="openen kan alleen op Windows", gevonden=str(hits[0]))
    os.startfile(str(hits[0]))  # type: ignore[attr-defined]
    return resultaat("niet_gecontroleerd", geopend=str(hits[0]), controle="Windows is gevraagd het bestand te openen")


def screenshot_jpeg() -> str:
    from PIL import ImageGrab  # type: ignore
    img = ImageGrab.grab(all_screens=False)
    img.thumbnail((1280, 1280))
    buf = io.BytesIO()
    img.convert("RGB").save(buf, "JPEG", quality=70)
    return base64.b64encode(buf.getvalue()).decode()


def schermpje_jpeg(breed: int = 560) -> str:
    """Een klein plaatje van het scherm voor de werkmodus (blijft op de laptop)."""
    from PIL import ImageGrab  # type: ignore
    img = ImageGrab.grab(all_screens=False)
    img.thumbnail((breed, breed))
    buf = io.BytesIO()
    img.convert("RGB").save(buf, "JPEG", quality=60)
    return base64.b64encode(buf.getvalue()).decode()


def info() -> dict:
    uit = {"tijd": time.strftime("%H:%M"), "datum": time.strftime("%d-%m-%Y")}
    if WINDOWS:
        class SPS(ctypes.Structure):
            _fields_ = [("ACLineStatus", ctypes.c_byte), ("BatteryFlag", ctypes.c_byte), ("BatteryLifePercent", ctypes.c_byte), ("SystemStatusFlag", ctypes.c_byte),
                        ("BatteryLifeTime", ctypes.c_ulong), ("BatteryFullLifeTime", ctypes.c_ulong)]
        s = SPS()
        if ctypes.windll.kernel32.GetSystemPowerStatus(ctypes.byref(s)) and s.BatteryLifePercent != -1:  # type: ignore[attr-defined]
            uit["batterij"] = f"{s.BatteryLifePercent & 0xFF}%{' (laadt)' if s.ACLineStatus == 1 else ''}"
        v = volume_lezen()
        if v is not None:
            uit["volume"] = f"{v}%"
    return resultaat("gedaan", **uit)


def maak_uitvoerder(beschrijf_beeld=None):
    """Geeft uitvoeren(actie, args). beschrijf_beeld(jpeg_b64) → tekst (online via ECO, offline via het lokale model)."""

    def uitvoeren(actie: str, args: dict) -> dict:
        a = {k: str(v) for k, v in (args or {}).items()}
        if actie == "app_openen":
            return app_openen(a.get("naam", ""))
        if actie == "website_openen":
            return website_openen(a.get("url") or a.get("naam", ""))
        if actie == "media":
            return media(a.get("opdracht", ""))
        if actie == "volume":
            return volume(a.get("opdracht", ""))
        if actie == "typen":
            return typen(a.get("tekst", ""))
        if actie == "bestand_zoeken":
            hits = bestand_zoeken(a.get("naam", ""))
            return resultaat("gedaan", gevonden=[str(p) for p in hits]) if hits else resultaat("gedaan", gevonden=[], uitleg="niets gevonden")
        if actie == "bestand_openen":
            return bestand_openen(a.get("naam", ""))
        if actie == "bestand_lezen":
            import nova_doc
            return nova_doc.bestand_lezen(a.get("naam", ""), bestand_zoeken)
        if actie == "document_maken":
            import nova_doc
            return nova_doc.document_maken(a.get("naam", "") or a.get("titel", ""), a.get("tekst", ""), a.get("soort", "pdf"))
        if actie == "screenshot":
            try:
                beeld = screenshot_jpeg()
            except Exception as e:
                return resultaat("mislukt", fout=f"screenshot lukte niet: {e}")
            if not beschrijf_beeld:
                return resultaat("mislukt", fout="kan het beeld nu niet bekijken")
            return resultaat("gedaan", scherm=beschrijf_beeld(beeld))
        if actie == "vergrendelen":
            if not WINDOWS:
                return resultaat("mislukt", fout="alleen op Windows")
            ok = ctypes.windll.user32.LockWorkStation()  # type: ignore[attr-defined]
            return resultaat("gedaan" if ok else "mislukt", vergrendeld=bool(ok))
        if actie in ("afsluiten", "herstarten"):
            if not WINDOWS:
                return resultaat("mislukt", fout="alleen op Windows")
            vlag = "/s" if actie == "afsluiten" else "/r"
            p = subprocess.run(["shutdown", vlag, "/t", "30", "/c", f"NOVA: {actie} over 30 seconden (annuleren: shutdown /a)"], capture_output=True, text=True, creationflags=0x08000000)
            return resultaat("gedaan" if p.returncode == 0 else "mislukt", **({"over": "30 seconden", "annuleren": "zeg 'stop met afsluiten' of typ shutdown /a"} if p.returncode == 0 else {"fout": p.stderr.strip()[:200]}))
        if actie == "annuleer_afsluiten":
            if not WINDOWS:
                return resultaat("mislukt", fout="alleen op Windows")
            p = subprocess.run(["shutdown", "/a"], capture_output=True, text=True, creationflags=0x08000000)
            return resultaat("gedaan" if p.returncode == 0 else "mislukt", geannuleerd=p.returncode == 0)
        if actie == "info":
            return info()
        return resultaat("mislukt", fout=f"onbekende actie '{actie}'")

    return uitvoeren
