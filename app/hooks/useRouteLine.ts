"use client";
// A térképen mutatott útvonal: a túra címei a lista sorrendjében, vagy („Hátralévő útvonal”) csak az elintézetlen
// címek, a jelenlegi helyzettől újraszámolt sorrendben. Az úthálózati vonalat az OSRM adja.
import { useEffect, useRef, useState } from "react";
import { routeThrough } from "@/lib/external";
import type { LatLon } from "@/lib/geo";
import { bestOrder } from "@/lib/route-order";
import { isLocated, type Stop } from "@/lib/types";

type Options = {
  enabled: boolean;
  stops: Stop[];
  restOnly: boolean;
  /** Az elintézetlen címek (hátralévő módban ezekből számol). */
  isPending: (s: Stop) => boolean;
  gps: LatLon | null;
};

export function useRouteLine({ enabled, stops, restOnly, isPending, gps }: Options) {
  const [line, setLine] = useState<[number, number][] | null>(null);
  const [message, setMessage] = useState("");
  const [restOrder, setRestOrder] = useState<string[]>([]);
  const gpsRef = useRef(gps);
  gpsRef.current = gps;
  // csak akkor számol újra, ha a hátralévő címek köre változik (nem minden GPS-pontnál)
  const restKey = restOnly
    ? stops
        .filter(isPending)
        .map((s) => s.id)
        .join(",")
    : "";

  useEffect(() => {
    if (!enabled) return;
    const located = stops.filter(isLocated);
    const here = gpsRef.current;
    let pts: LatLon[] = located;
    let summary = "";

    if (restOnly) {
      const rest = bestOrder(located.filter(isPending), here);
      setRestOrder(rest.map((s) => s.id));
      pts = here && rest.length ? [here, ...rest] : rest;
      summary = rest.length
        ? `Hátralévő útvonal: ${rest.length} cím${here ? " a jelenlegi helyzetedtől" : ""} (újraszámolva)`
        : "Minden cím le van adva – nincs hátralévő útvonal.";
    } else {
      setRestOrder([]);
      const missing = stops.length - located.length;
      if (missing) summary = `${located.length} / ${stops.length} cím a térképen · ${missing} cím helye hiányzik`;
    }
    setMessage(summary);
    setLine(pts.length ? pts.map((p) => [p.lat, p.lon]) : null);
    if (pts.length < 2) return;

    const abort = new AbortController();
    // jelöléskor ne kérjünk azonnal új útvonalat minden koppintásra
    const timer = setTimeout(
      () => {
        routeThrough(pts, abort.signal)
          .then((r) => {
            setLine(r.line);
            if (restOnly) {
              setMessage((m) => `${m} · ${(r.distance / 1000).toFixed(1)} km, kb. ${Math.round(r.duration / 60)} perc`);
            }
          })
          .catch((e) => {
            if (e.name === "AbortError") return;
            setMessage((m) => `${m}${m ? " · " : ""}Az úthálózati útvonal nem érhető el; egyenes szakaszok láthatók.`);
          });
      },
      restOnly ? 600 : 0,
    );
    return () => {
      clearTimeout(timer);
      abort.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- a `restKey` írja le a hátralévő címek változását
  }, [enabled, stops, restOnly, restKey]);

  return { line, message, restOrder };
}
