"use client";
// Navigáció egy címhez: útvonaltervezés, haladás követése, letérés esetén újratervezés, érkezés a célhoz.
import { useEffect, useMemo, useRef, useState } from "react";
import { routeBetween } from "@/lib/external";
import { angleDiff, distanceM } from "@/lib/geo";
import { buildNav, onRouteTolerance, snapToRoute, stepText, upcomingStepIndex, type Nav } from "@/lib/navigation";
import { say } from "@/lib/speech";
import type { Stop } from "@/lib/types";
import type { Fix } from "./useGeolocation";
import { useWakeLock } from "./useScreen";

const NEAR_STRAIGHT_M = 50; // ennyire a céltól: „közel vagy”
const NEAR_ALONG_M = 60;
const ARRIVE_STRAIGHT_M = 20; // ennyire a céltól: megérkeztél
const ARRIVE_ALONG_M = 15;
const OFF_ROUTE_FIXES = 3; // ennyi egymás utáni pont az útvonalon kívül → újratervezés
const REROUTE_PAUSE_MS = 8000;
const MAX_ACCURACY_FOR_REROUTE_M = 50;

type Options = {
  gps: Fix | null;
  heading: number | null;
  voice: boolean;
  /** A helymeghatározás indítása (ha még nem fut). */
  watch: () => void;
  onMessage: (text: string) => void;
  /** Új útvonal indult (nem újratervezés). */
  onStarted: () => void;
  /** Közel értünk a célhoz (egyszer címenként). */
  onNear: (to: Stop) => void;
  /** Megérkeztünk: a navigáció leállt. */
  onArrive: (to: Stop) => void;
};

export function useNavigation(o: Options) {
  const [nav, setNav] = useState<Nav | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [rerouting, setRerouting] = useState(false);
  const snapFrom = useRef(0);
  const offCount = useRef(0);
  const lastPlan = useRef(0);
  const pending = useRef<Stop | null>(null);
  const nearDone = useRef("");
  const opts = useRef(o);
  opts.current = o;

  /** Útvonal tervezése a jelenlegi helyzetből. reroute: letérés miatti újratervezés (a menetirányt is figyelembe veszi). */
  async function start(to: Stop, reroute = false) {
    const { gps, heading, watch, onMessage, onStarted } = opts.current;
    if (!gps) {
      pending.current = to;
      watch();
      onMessage("Helyzet meghatározása…");
      return;
    }
    if (to.lat == null || to.lon == null) {
      onMessage("Ennek a címnek nincs helye a térképen.");
      return;
    }
    if (!reroute) onMessage("Útvonal tervezése…");
    setRerouting(reroute);
    lastPlan.current = Date.now();
    try {
      const route = await routeBetween(gps, { lat: to.lat, lon: to.lon }, heading);
      if (!route) throw new Error("no route");
      const next = buildNav(to, route);
      setNav(next);
      setStepIndex(reroute && next.steps.length > 1 ? 1 : 0);
      snapFrom.current = 0;
      offCount.current = 0;
      onMessage("");
      if (!reroute) onStarted();
    } catch {
      if (!reroute) onMessage("Az útvonaltervezés nem sikerült (internet kell).");
    } finally {
      setRerouting(false);
    }
  }

  const stop = () => setNav(null);

  // ha a helyzet még nem volt meg, az első GPS-pont után indul
  useEffect(() => {
    if (o.gps && pending.current) {
      const to = pending.current;
      pending.current = null;
      start(to);
    }
  }, [o.gps]); // az első GPS-pontra vár

  const snap = useMemo(() => (nav && o.gps ? snapToRoute(nav, o.gps, snapFrom.current) : null), [nav, o.gps]);
  const onRoute = !!snap && snap.dist <= onRouteTolerance(o.gps?.acc);

  // haladás követése
  useEffect(() => {
    const { gps, voice, onNear, onArrive, onMessage } = opts.current;
    if (!nav || !gps || !snap) return;
    const straight = distanceM(gps, { lat: nav.to.lat!, lon: nav.to.lon! });
    const left = onRoute ? nav.dist - snap.along : straight;

    if (nearDone.current !== nav.to.id && (straight < NEAR_STRAIGHT_M || left < NEAR_ALONG_M)) {
      nearDone.current = nav.to.id;
      onNear(nav.to);
    }
    if (straight < ARRIVE_STRAIGHT_M || (onRoute && left < ARRIVE_ALONG_M)) {
      if (nearDone.current !== nav.to.id) {
        nearDone.current = nav.to.id;
        onNear(nav.to);
      }
      setNav(null);
      onMessage(`Megérkeztél: ${nav.to.address}`);
      if (voice) say("Megérkeztél", false);
      onArrive(nav.to);
      return;
    }
    if (onRoute) {
      offCount.current = 0;
      snapFrom.current = snap.i;
      const i = upcomingStepIndex(nav, snap.along);
      if (i > stepIndex && (stepIndex > 0 || snap.along > 10)) setStepIndex(i);
      return;
    }
    if ((gps.acc ?? 0) > MAX_ACCURACY_FOR_REROUTE_M) return;
    offCount.current++;
    if (offCount.current >= OFF_ROUTE_FIXES && !rerouting && Date.now() - lastPlan.current > REROUTE_PAUSE_MS) {
      offCount.current = 0;
      if (voice) say("Újratervezés");
      start(nav.to, true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- minden új ráillesztésnél fut
  }, [snap]);

  // a következő manőver bemondása
  useEffect(() => {
    if (nav && o.voice && nav.steps[stepIndex]) say(stepText(nav.steps[stepIndex]));
  }, [stepIndex, nav, o.voice]);

  useWakeLock(!!nav);

  // a megjelenített helyzet és irány: navigáció közben az útra illesztve (mint a Google Maps-nél)
  const shownHeading =
    onRoute && snap && (o.heading == null || angleDiff(o.heading, snap.seg) < 50) ? snap.seg : o.heading;
  const shownPosition = nav && onRoute && snap && o.gps ? { lat: snap.pt[0], lon: snap.pt[1], acc: o.gps.acc } : o.gps;

  return {
    nav,
    stepIndex,
    snap,
    onRoute,
    rerouting,
    start,
    stop,
    shownHeading,
    shownPosition,
    /** A cél, amelynek a közelébe már értünk (a „következő címre lépés” ehhez igazodik). */
    nearTargetId: () => nearDone.current,
  };
}
