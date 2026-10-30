"""Twee keer klappen = ECO gaat luisteren (in plaats van "Hé ECO").

Alles gebeurt op de laptop zelf: het geluid gaat nergens heen en wordt meteen weer vergeten. Een klap is een korte, scherpe
tik: plots veel harder dan het achtergrondgeluid, met veel hoge tonen, en binnen ~0,15 s weer weg. Praten en muziek duren
langer en tellen dus niet. Er moeten precies twee klappen komen, 0,15 tot 0,8 s na elkaar, in de stilte (geen ander hard
geluid ervoor, ertussen of erna); drie of meer (applaus, muziek) tellen niet. Dezelfde regels staan in ai.js voor de website.
"""
from __future__ import annotations

import numpy as np

VAK_S = 0.01            # we kijken per 10 ms
STIL_ERVOOR_S = 0.3     # vóór de eerste klap even geen harde geluiden
KORT_S = 0.15           # een klap is na zoveel tijd weer weg
MIN_TUSSEN_S, MAX_TUSSEN_S = 0.15, 0.8
WACHT_NA_S = 0.35       # na de tweede klap even kijken of er geen derde komt


class KlapDetector:
    def __init__(self, rate: int = 16000):
        self.rate, self.n = rate, int(rate * VAK_S)
        self.rest = np.zeros(0, np.float32)
        self.t = 0.0                 # tijd in seconden sinds de start
        self.vloer = 0.003           # achtergrondgeluid (RMS)
        self.vorige = 0.0
        self.laatst_hard = -10.0     # laatste moment met een hard geluid dat geen klap was
        self.staart = -10.0          # tot dan sterft de vorige klap nog uit (galm telt niet als hard geluid)
        self.kandidaat = None        # (begin, piek) van een mogelijke klap
        self.klappen: list[float] = []

    def voed(self, samples) -> bool:
        """Geeft True op het moment dat er twee keer geklapt is."""
        x = np.asarray(samples)
        x = x.astype(np.float32) / 32768 if x.dtype == np.int16 else x.astype(np.float32)
        x = np.concatenate([self.rest, x])
        gevonden = False
        while len(x) >= self.n:
            if self._vak(x[: self.n]):
                gevonden = True
            x = x[self.n:]
        self.rest = x
        return gevonden

    def _vak(self, v: np.ndarray) -> bool:
        self.t += VAK_S
        rms = float(np.sqrt(np.mean(v * v))) + 1e-9
        zcr = float(np.mean(np.abs(np.diff(np.signbit(v).astype(np.int8))))) if len(v) > 1 else 0.0
        drempel = max(0.02, self.vloer * 6)
        if self.kandidaat:  # is het een korte tik (klap) of iets dat blijft (stem, muziek)?
            begin, piek = self.kandidaat
            piek = max(piek, rms)
            self.kandidaat = (begin, piek)
            if rms < piek * 0.25:
                self.kandidaat, self.staart = None, self.t + KORT_S
                return self._klap(begin)
            if self.t - begin > KORT_S:
                self.kandidaat, self.klappen, self.laatst_hard = None, [], self.t
        elif rms > drempel and rms > self.vorige * 3 and zcr > 0.12:
            self.kandidaat = (self.t, rms)
        elif rms > drempel and (self.t > self.staart or rms > self.vorige * 1.2):
            self.laatst_hard = self.t  # hard maar geen klap (stem, muziek, bonk)
        if self.klappen and self.laatst_hard > self.klappen[0]:
            self.klappen = []  # er klonk iets anders tussendoor: geen klappen in de stilte
        if not self.kandidaat and rms < drempel:
            self.vloer += (min(rms, 0.05) - self.vloer) * 0.02  # het achtergrondgeluid langzaam volgen
        self.vorige = rms
        if len(self.klappen) == 2 and not self.kandidaat and self.t - self.klappen[-1] >= WACHT_NA_S:
            self.klappen = []
            return True
        if len(self.klappen) == 1 and self.t - self.klappen[0] > MAX_TUSSEN_S:
            self.klappen = []
        return False

    def _klap(self, t: float) -> bool:
        if not self.klappen:
            if t - self.laatst_hard >= STIL_ERVOOR_S:
                self.klappen = [t]
            return False
        tussen = t - self.klappen[-1]
        if len(self.klappen) == 1 and MIN_TUSSEN_S <= tussen <= MAX_TUSSEN_S:
            self.klappen.append(t)
        else:  # te snel, te laat of een derde klap: opnieuw beginnen
            self.klappen, self.laatst_hard = [], t
        return False
