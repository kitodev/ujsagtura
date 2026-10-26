"use client";
// A túrák, címek és az adott napi jelölések betöltése, napváltáskor tisztán (az előző nap adatai nem keverednek bele).
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { HIDDEN_ROUTES } from "@/lib/hidden";
import type { Deliveries, Meta, Route, Stop, StopsResponse } from "@/lib/types";

const HIDDEN = new Set(HIDDEN_ROUTES);
export const visibleRoutes = (xs: Route[]) => xs.filter((r) => !HIDDEN.has(r.id));
export const visibleStops = (xs: Stop[]) => xs.filter((s) => !HIDDEN.has(s.route_id ?? ""));

/** A régi értékek közül a megadott címek újságjait eltávolítja, és hozzáadja az újakat. */
function replaceFor<T>(old: Record<string, T>, stops: Stop[], fresh: Record<string, T> | undefined) {
  const next = { ...old };
  for (const s of stops) for (const p of s.stop_papers) delete next[p.id];
  return { ...next, ...fresh };
}

export function useTourData(day: string, onError: (message: string) => void) {
  const [routes, setRoutes] = useState<Route[]>([]);
  const [route, setRoute] = useState("");
  /** A kiválasztott túra címei. */
  const [stops, setStops] = useState<Stop[]>([]);
  /** Minden túra címei (a térképhez). */
  const [allStops, setAllStops] = useState<Stop[]>([]);
  const [deliveries, setDeliveries] = useState<Deliveries>({});
  /** Örökölt lemondások: újság → melyik naptól. */
  const [since, setSince] = useState<Record<string, string>>({});
  const [meta, setMeta] = useState<Meta>({ papers: [], addresses: [], names: [] });
  /** Minden betöltéskor nő (a keresés frissítéséhez). */
  const [version, setVersion] = useState(0);
  const dayRef = useRef(day);
  dayRef.current = day;
  const errorRef = useRef(onError);
  errorRef.current = onError;

  useEffect(() => {
    setDeliveries({});
    setSince({});
  }, [day]);

  useEffect(() => {
    api
      .routes()
      .then((all) => {
        const list = visibleRoutes(all);
        setRoutes(list);
        setRoute((r) => r || (list[0]?.id ?? ""));
      })
      .catch(() => onError("Nem érhető el az adatbázis"));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- egyszer, induláskor
  }, []);

  /** Jelölések beolvasása egy válaszból (csak az abban szereplő címekre). */
  const absorb = useCallback((res: StopsResponse) => {
    setDeliveries((old) => replaceFor(old, res.stops, res.deliveries));
    setSince((old) => replaceFor(old, res.stops, res.since));
  }, []);

  /** A kiválasztott (vagy megadott) túra újratöltése. */
  const loadRoute = useCallback(
    async (r: string) => {
      const res = await api.stops(r, day);
      if (dayRef.current !== day) return; // időközben másik napra váltottunk
      setStops(res.stops);
      setVersion((v) => v + 1);
      absorb(res);
      api
        .meta()
        .then(setMeta)
        .catch(() => {});
    },
    [day, absorb],
  );

  /** Minden túra újratöltése (térkép). */
  const loadAll = useCallback(async () => {
    const res = await api.stops("all", day);
    if (dayRef.current !== day) return;
    setAllStops(visibleStops(res.stops));
    setDeliveries((old) => ({ ...old, ...res.deliveries }));
    setSince((old) => ({ ...old, ...(res.since ?? {}) }));
  }, [day]);

  useEffect(() => {
    if (route) loadRoute(route).catch(() => errorRef.current("A címek most nem tölthetők be (nincs internet?)."));
  }, [route, loadRoute]);

  const reloadRoutes = useCallback(async () => setRoutes(visibleRoutes(await api.routes())), []);

  return {
    routes,
    reloadRoutes,
    route,
    setRoute,
    stops,
    allStops,
    deliveries,
    setDeliveries,
    since,
    setSince,
    meta,
    version,
    loadRoute,
    loadAll,
    absorb,
  };
}
