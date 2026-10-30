"""Maakt NOVA's app-icoon (de reactor uit de HUD, in ECO's cyaan) als nova.ico voor Windows. Draait in de bouwstraat.

Gebruik: python maak_icoon.py ui/nova.ico [voorbeeld.png]
"""
from __future__ import annotations

import math
import sys

from PIL import Image, ImageDraw, ImageFilter

CYAAN, LICHT, DONKER, METAAL = (0, 225, 255), (159, 247, 255), (1, 7, 12), (40, 58, 66)


def reactor(n: int = 1024) -> Image.Image:
    """Tekent op n×n pixels (groot, daarna verkleinen voor scherpe randen)."""
    img = Image.new("RGBA", (n, n), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    c, r = n / 2, n * 0.47
    d.ellipse([c - r, c - r, c + r, c + r], fill=DONKER + (255,))                       # achtergrond
    d.ellipse([c - r, c - r, c + r, c + r], outline=METAAL + (255,), width=int(n * .045))  # behuizing
    gloed = Image.new("RGBA", (n, n), (0, 0, 0, 0))                                        # cyaan gloed achter de spoelen
    ImageDraw.Draw(gloed).ellipse([c - r * .86, c - r * .86, c + r * .86, c + r * .86], fill=CYAAN + (110,))
    img.alpha_composite(gloed.filter(ImageFilter.GaussianBlur(n * .05)))
    d = ImageDraw.Draw(img)
    ro, ri = r * .84, r * .56                                                              # tien spoelen, zoals de reactor in de HUD
    for i in range(10):
        a0, a1 = math.radians(i * 36 - 90 + 5), math.radians(i * 36 - 90 + 31)
        punten = [(c + math.cos(a) * ro, c + math.sin(a) * ro) for a in (a0 + (a1 - a0) * t / 12 for t in range(13))]
        punten += [(c + math.cos(a) * ri, c + math.sin(a) * ri) for a in (a1 - (a1 - a0) * t / 12 for t in range(13))]
        d.polygon(punten, fill=CYAAN + (255,))
    d.ellipse([c - r * .5, c - r * .5, c + r * .5, c + r * .5], outline=METAAL + (255,), width=int(n * .03))
    kern = Image.new("RGBA", (n, n), (0, 0, 0, 0))                                         # witte kern met gloed
    ImageDraw.Draw(kern).ellipse([c - r * .4, c - r * .4, c + r * .4, c + r * .4], fill=LICHT + (255,))
    img.alpha_composite(kern.filter(ImageFilter.GaussianBlur(n * .02)))
    d = ImageDraw.Draw(img)
    d.ellipse([c - r * .3, c - r * .3, c + r * .3, c + r * .3], fill=(255, 255, 255, 255))
    return img


def main() -> None:
    doel = sys.argv[1] if len(sys.argv) > 1 else "ui/nova.ico"
    groot = reactor()
    groot.resize((256, 256), Image.LANCZOS).save(doel, sizes=[(s, s) for s in (16, 24, 32, 48, 64, 128, 256)])
    if len(sys.argv) > 2:
        groot.resize((256, 256), Image.LANCZOS).save(sys.argv[2])
    print(f"icoon gemaakt: {doel}")


if __name__ == "__main__":
    main()
