"use client";
// Helymeghatározás és menetirány: GPS-irány, ha haladunk; különben az elmozdulás iránya; álló helyzetben iránytű.
import { useCallback, useRef, useState } from "react";
import { angleDiff, bearingDeg, distanceM, type LatLon } from "@/lib/geo";

export type Fix = LatLon & { acc?: number };

const MIN_SPEED_MS = 1; // ennél lassabban a GPS saját iránya megbízhatatlan
const MIN_MOVE_M = 5; // ennyi elmozdulás után számolunk irányt a két pontból
const MAX_ACCURACY_M = 30;
const COMPASS_AFTER_MOVE_MS = 4000; // mozgás után ennyi ideig nem az iránytű dönt
const COMPASS_INTERVAL_MS = 400;
const COMPASS_MIN_CHANGE = 5;

type OrientationEvent = DeviceOrientationEvent & { webkitCompassHeading?: number };
type PermissionApi = { requestPermission?: () => Promise<string> };

export function useGeolocation() {
  const [gps, setGps] = useState<Fix | null>(null);
  const [heading, setHeading] = useState<number | null>(null);
  const watchId = useRef<number | null>(null);
  const prevFix = useRef<LatLon | null>(null);
  const lastMove = useRef(0);
  const lastCompass = useRef(0);

  const onPosition = useCallback((p: GeolocationPosition) => {
    const c = p.coords;
    const cur = { lat: c.latitude, lon: c.longitude };
    const prev = prevFix.current;
    const moved = prev ? distanceM(prev, cur) : 0;

    let h: number | null = null;
    if (c.heading != null && !isNaN(c.heading) && (c.speed ?? 0) >= MIN_SPEED_MS) h = c.heading;
    else if (prev && moved >= MIN_MOVE_M && c.accuracy <= MAX_ACCURACY_M) h = bearingDeg(prev, cur);
    if (!prev || moved >= MIN_MOVE_M) prevFix.current = cur;

    if (h != null) {
      lastMove.current = Date.now();
      setHeading(h);
    }
    setGps({ ...cur, acc: c.accuracy });
  }, []);

  const onOrientation = useCallback((e: OrientationEvent) => {
    const now = Date.now();
    if (now - lastMove.current < COMPASS_AFTER_MOVE_MS || now - lastCompass.current < COMPASS_INTERVAL_MS) return;
    let h: number | null = null;
    if (e.webkitCompassHeading != null) h = e.webkitCompassHeading;
    else if (e.absolute && e.alpha != null) h = 360 - e.alpha;
    if (h == null) return;
    lastCompass.current = now;
    const compass = (h + (screen.orientation?.angle ?? 0) + 360) % 360;
    setHeading((old) => (old == null || angleDiff(old, compass) > COMPASS_MIN_CHANGE ? compass : old));
  }, []);

  /** A követés indítása (többszöri hívás sem indít újat). iPhone-on az iránytűhöz engedélyt kér. */
  const watch = useCallback(() => {
    if (watchId.current != null || !navigator.geolocation) return;
    watchId.current = navigator.geolocation.watchPosition(
      onPosition,
      () => {
        watchId.current = null;
        alert("A helymeghatározás nincs engedélyezve");
      },
      { enableHighAccuracy: true, maximumAge: 1000 },
    );
    const listen = () => {
      window.addEventListener("deviceorientationabsolute", onOrientation as EventListener, true);
      window.addEventListener("deviceorientation", onOrientation as EventListener, true);
    };
    const permission = (window as unknown as { DeviceOrientationEvent?: PermissionApi }).DeviceOrientationEvent;
    if (permission?.requestPermission) {
      permission
        .requestPermission()
        .then((r) => r === "granted" && listen())
        .catch(() => {});
    } else listen();
  }, [onPosition, onOrientation]);

  return { gps, heading, watch };
}
