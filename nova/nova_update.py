"""NOVA werkt zichzelf bij: zodra NOVA verbonden is (en daarna elk uur) kijken of er op GitHub een nieuwere NOVA.exe staat.

Zo ja: NOVA vraagt het Serkan; zegt hij ja, dan meteen downloaden, de SHA-256 controleren (GitHub geeft die per bestand), het draaiende NOVA.exe hernoemen naar
NOVA.oud.exe (Windows staat hernoemen van een draaiend programma toe), de nieuwe neerzetten en opnieuw starten.
Bij de volgende start ruimt NOVA het oude bestand op. Alleen in de gebouwde exe, niet bij ontwikkelen.
"""
from __future__ import annotations

import hashlib
import os
import re
import subprocess
import sys
from pathlib import Path

import requests

RELEASES = "https://api.github.com/repos/SE-KIB/LERENISLEUK/releases/latest"


def huidige_build(ui_map: Path) -> int:
    try:
        return int((ui_map / "build.txt").read_text().strip())
    except (OSError, ValueError):
        return 0


def nieuwste(url: str = RELEASES) -> dict | None:
    """Laatste release: {build, tag, url, sha256, grootte} of None."""
    r = requests.get(url, headers={"accept": "application/vnd.github+json"}, timeout=15)
    if r.status_code != 200:
        return None
    rel = r.json()
    m = re.search(r"(\d+)$", rel.get("tag_name", ""))
    asset = next((a for a in rel.get("assets", []) if a.get("name") == "NOVA.exe"), None)
    if not m or not asset:
        return None
    digest = str(asset.get("digest") or "")
    return {"build": int(m.group(1)), "tag": rel["tag_name"], "url": asset["browser_download_url"],
            "sha256": digest.split(":", 1)[1].lower() if digest.startswith("sha256:") else "", "grootte": asset.get("size", 0)}


def opruimen(exe: Path) -> None:
    oud = exe.with_name(exe.stem + ".oud.exe")
    try:
        oud.unlink(missing_ok=True)
    except OSError:
        pass  # nog in gebruik: volgende keer


def bijwerken(exe: Path, build: int, info: dict, herstart=True, on_voortgang=None) -> bool:
    """Vervangt exe door de nieuwe versie. Geeft True als er bijgewerkt is (dan moet NOVA stoppen)."""
    if info["build"] <= build:
        return False
    nieuw = exe.with_name(exe.stem + ".nieuw.exe")
    h = hashlib.sha256()
    with requests.get(info["url"], stream=True, timeout=120) as r:
        r.raise_for_status()
        with open(nieuw, "wb") as f:
            totaal, binnen = int(r.headers.get("content-length") or info.get("grootte") or 0), 0
            for stuk in r.iter_content(1 << 16):
                f.write(stuk)
                h.update(stuk)
                binnen += len(stuk)
                if on_voortgang and totaal:
                    on_voortgang(min(1.0, binnen / totaal))
    if info["sha256"] and h.hexdigest() != info["sha256"]:
        nieuw.unlink(missing_ok=True)
        raise RuntimeError("download klopt niet (SHA-256 wijkt af); niet bijgewerkt")
    if info["grootte"] and nieuw.stat().st_size != info["grootte"]:
        nieuw.unlink(missing_ok=True)
        raise RuntimeError("download onvolledig; niet bijgewerkt")
    oud = exe.with_name(exe.stem + ".oud.exe")
    opruimen(exe)
    os.replace(exe, oud)
    os.replace(nieuw, exe)
    if herstart:
        subprocess.Popen([str(exe)], close_fds=True, creationflags=0x00000008 | 0x00000200 if sys.platform == "win32" else 0)
    return True
