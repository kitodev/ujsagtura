// A térképen mutatott útvonal: a túra címei a lista sorrendjében, vagy („Hátralévő útvonal”) csak az elintézetlen
// címek, a jelenlegi helyzettől újraszámolt sorrendben.
import { useEffect, useRef, useState } from "react";
import type { LatLon } from "@shared/geo";
import { bestOrder } from "@shared/route-order";
import { isLocated, type Stop } from "@shared/types";
import { isAbort } from "@/lib/net";
import { routeThrough } from "@/lib/routing";

type Options = {
  enabled: boolean;
  stops: Stop[];
  restOnly: boolean;
  isPending: (s: Stop) => boolean;
  gps: LatLon | null;
  online: boolean;
};

export function useRouteLine({ enabled, stops, restOnly, isPending, gps, online }: Options) {
  const [line, setLine] = useState<[number, number][] | null>(null);
  const [message, setMessage] = useState("");
  const [restOrder, setRestOrder] = useState<string[]>([]);
  const gpsRef = useRef(gps);
  gpsRef.current = gps;
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
    const timer = setTimeout(
      () => {
        routeThrough(pts, abort.signal, online)
          .then((r) => {
            setLine(r.line);
            if (r.offline) setMessage((m) => `${m}${m ? " · " : ""}📴 offline úthálózat`);
            if (restOnly) {
              setMessage((m) => `${m} · ${(r.distance / 1000).toFixed(1)} km, kb. ${Math.round(r.duration / 60)} perc`);
            }
          })
          .catch((e) => {
            if (isAbort(e)) return;
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
  }, [enabled, stops, restOnly, restKey, online]);

  return { line, message, restOrder };
}
