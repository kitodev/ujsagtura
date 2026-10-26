"use client";
// A képernyővel kapcsolatos mellékhatások: teljes képernyő, ébren tartás.
import { useEffect } from "react";

type WakeLock = { release: () => Promise<void> };
type WakeLockNavigator = Navigator & { wakeLock?: { request: (type: "screen") => Promise<WakeLock> } };

/**
 * Teljes képernyő: a böngésző saját teljes képernyős módja is (ahol támogatott), és a háttér görgetésének tiltása.
 * Ha a felhasználó a böngészőben lép ki (pl. vissza gomb), `onExit` hívódik.
 */
export function useFullscreen(full: boolean, onExit: () => void) {
  useEffect(() => {
    document.body.style.overflow = full ? "hidden" : "";
    if (full) document.documentElement.requestFullscreen?.().catch(() => {});
    else if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    const onChange = () => {
      if (!document.fullscreenElement) onExit();
    };
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- csak a `full` változásakor
  }, [full]);
}

/** A képernyő ébren tartása, amíg `active` igaz (navigáció közben). */
export function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    let lock: WakeLock | null = null;
    (navigator as WakeLockNavigator).wakeLock
      ?.request("screen")
      .then((l) => (lock = l))
      .catch(() => {});
    return () => {
      lock?.release().catch(() => {});
    };
  }, [active]);
}
