"use client";
// Egy cím elintézése után (minden újság jelölve) pár másodperc múlva indul a navigáció a következő címre.
// Közben még át lehet jelölni (újraindul a visszaszámlálás), azonnal indulni, vagy maradni.
import { useEffect, useState } from "react";
import type { Stop } from "@/lib/types";

export const ADVANCE_DELAY_MS = 4000;

export type Advance = { from: Stop; to: Stop | null; at: number };

export function useAutoAdvance(onGo: (to: Stop) => void, onFinish: () => void) {
  const [advance, setAdvance] = useState<Advance | null>(null);
  const [, setTick] = useState(0); // a visszaszámlálás frissítéséhez

  useEffect(() => {
    if (!advance) return;
    const timer = setInterval(() => {
      setTick((t) => t + 1);
      if (Date.now() < advance.at) return;
      clearInterval(timer);
      setAdvance(null);
      if (advance.to) onGo(advance.to);
      else onFinish();
    }, 250);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- új időzítés minden új `advance`-nál
  }, [advance]);

  return {
    advance,
    /** Időzítés indítása (vagy újraindítása) a `from` cím után. */
    schedule: (from: Stop, to: Stop | null) => setAdvance({ from, to, at: Date.now() + ADVANCE_DELAY_MS }),
    cancel: () => setAdvance(null),
    goNow: () => setAdvance((a) => (a ? { ...a, at: Date.now() } : a)),
    secondsLeft: advance ? Math.max(0, Math.ceil((advance.at - Date.now()) / 1000)) : 0,
  };
}
