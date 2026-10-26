// Helymeghatározás és menetirány: GPS-irány, ha haladunk; különben az elmozdulás iránya; álló helyzetben iránytű.
import * as Location from "expo-location";
import { useCallback, useEffect, useRef, useState } from "react";
import { Alert } from "react-native";
import { angleDiff, bearingDeg, distanceM, type LatLon } from "@shared/geo";

export type Fix = LatLon & { acc?: number };

const MIN_SPEED_MS = 1; // ennél lassabban a GPS saját iránya megbízhatatlan
const MIN_MOVE_M = 5; // ennyi elmozdulás után számolunk irányt a két pontból
const MAX_ACCURACY_M = 30;
const COMPASS_AFTER_MOVE_MS = 4000; // mozgás után ennyi ideig nem az iránytű dönt
const COMPASS_INTERVAL_MS = 400;
const COMPASS_MIN_CHANGE = 5;

export function useLocation() {
  const [gps, setGps] = useState<Fix | null>(null);
  const [heading, setHeading] = useState<number | null>(null);
  const subs = useRef<{ remove: () => void }[]>([]);
  const starting = useRef(false);
  const prevFix = useRef<LatLon | null>(null);
  const lastMove = useRef(0);
  const lastCompass = useRef(0);

  const onPosition = useCallback((p: Location.LocationObject) => {
    const c = p.coords;
    const cur = { lat: c.latitude, lon: c.longitude };
    const prev = prevFix.current;
    const moved = prev ? distanceM(prev, cur) : 0;
    const acc = c.accuracy ?? undefined;

    let h: number | null = null;
    if (c.heading != null && c.heading >= 0 && (c.speed ?? 0) >= MIN_SPEED_MS) h = c.heading;
    else if (prev && moved >= MIN_MOVE_M && (acc ?? 0) <= MAX_ACCURACY_M) h = bearingDeg(prev, cur);
    if (!prev || moved >= MIN_MOVE_M) prevFix.current = cur;

    if (h != null) {
      lastMove.current = Date.now();
      setHeading(h);
    }
    setGps({ ...cur, acc });
  }, []);

  const onCompass = useCallback((h: Location.LocationHeadingObject) => {
    const now = Date.now();
    if (now - lastMove.current < COMPASS_AFTER_MOVE_MS || now - lastCompass.current < COMPASS_INTERVAL_MS) return;
    const value = h.trueHeading >= 0 ? h.trueHeading : h.magHeading;
    if (value == null || value < 0) return;
    lastCompass.current = now;
    setHeading((old) => (old == null || angleDiff(old, value) > COMPASS_MIN_CHANGE ? value : old));
  }, []);

  /** A követés indítása (többszöri hívás sem indít újat). */
  const watch = useCallback(async () => {
    if (subs.current.length || starting.current) return;
    starting.current = true;
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Helymeghatározás", "A helymeghatározás nincs engedélyezve az alkalmazásnak.");
        return;
      }
      subs.current.push(
        await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 1000, distanceInterval: 1 },
          onPosition,
        ),
      );
      const compass = await Location.watchHeadingAsync(onCompass).catch(() => null);
      if (compass) subs.current.push(compass);
    } finally {
      starting.current = false;
    }
  }, [onPosition, onCompass]);

  useEffect(
    () => () => {
      subs.current.forEach((s) => s.remove());
      subs.current = [];
    },
    [],
  );

  return { gps, heading, watch };
}
