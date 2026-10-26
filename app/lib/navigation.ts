// Navigáció: OSRM útvonal feldolgozása, manőverek szövege, helyzet ráillesztése az útvonalra.
import { bearingDeg, distanceM, metersPerDegree, type LatLon } from "./geo";
import type { Stop } from "./types";

export type Maneuver = { type: string; modifier?: string; exit?: number; location: [number, number] };
export type Step = { name: string; distance: number; maneuver: Maneuver };

/** Az OSRM útvonal-válasz számunkra fontos része. */
export type OsrmRoute = {
  legs: { steps: Step[] }[];
  geometry: { coordinates: number[][] };
  distance: number;
  duration: number;
};

/** Futó navigáció. A koordináták [lat, lon] párok. */
export type Nav = {
  to: Stop;
  steps: Step[];
  coords: [number, number][];
  /** Az egyes vonalpontok távolsága az útvonal elejétől (m). */
  at: number[];
  /** Az egyes manőverek távolsága az útvonal elejétől (m). */
  stepAt: number[];
  dist: number;
  dur: number;
};

/** A helyzet az útvonalra illesztve. */
export type Snap = {
  /** Távolság a vonaltól (m). */
  dist: number;
  /** A szakasz kezdőpontjának indexe. */
  i: number;
  /** A ráillesztett pont [lat, lon]. */
  pt: [number, number];
  /** Megtett táv az útvonal elejétől (m). */
  along: number;
  /** Az adott szakasz iránya (fok). */
  seg: number;
};

const TURN: Record<string, string> = {
  left: "balra",
  right: "jobbra",
  "slight left": "enyhén balra",
  "slight right": "enyhén jobbra",
  "sharp left": "élesen balra",
  "sharp right": "élesen jobbra",
};

const ICON: Record<string, string> = {
  left: "⬅",
  right: "➡",
  "slight left": "↖",
  "slight right": "↗",
  "sharp left": "↙",
  "sharp right": "↘",
  uturn: "↶",
  straight: "⬆",
};

const isRoundabout = (m: Maneuver) => m.type === "roundabout" || m.type === "rotary";

/** A manőver magyar szöveges utasítása. */
export function stepText(step: Step): string {
  const m = step.maneuver;
  const street = step.name ? ` – ${step.name}` : "";
  if (m.type === "depart") return `Indulj el${street}`;
  if (m.type === "arrive") return "Megérkeztél";
  if (isRoundabout(m)) return `Körforgalomban hajts ki a ${m.exit ?? ""}. kijáraton${street}`;
  if (m.modifier === "uturn") return "Fordulj vissza";
  if (!m.modifier || m.modifier === "straight" || m.type === "continue") return `Haladj egyenesen${street}`;
  return `Fordulj ${TURN[m.modifier] ?? "tovább"}${street}`;
}

/** A manőver ikonja (nyíl). */
export function stepIcon(step: Step): string {
  const m = step.maneuver;
  if (m.type === "arrive") return "⚑";
  if (isRoundabout(m)) return "⟳";
  return ICON[m.modifier ?? "straight"] ?? "⬆";
}

/** Távolság kiírása: 10 m-re kerekítve, 1 km felett km-ben. */
export function formatDistance(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.max(0, Math.round(m / 10) * 10)} m`;
}

const toLatLon = ([lat, lon]: [number, number]): LatLon => ({ lat, lon });

/** Navigáció felépítése az OSRM válaszából. */
export function buildNav(to: Stop, route: OsrmRoute): Nav {
  const coords = route.geometry.coordinates.map(([lon, lat]) => [lat, lon] as [number, number]);
  const at = [0];
  for (let i = 1; i < coords.length; i++) at.push(at[i - 1] + distanceM(toLatLon(coords[i - 1]), toLatLon(coords[i])));
  const steps = route.legs[0].steps;
  const stepAt: number[] = [];
  steps.forEach((_, k) => stepAt.push(k ? stepAt[k - 1] + steps[k - 1].distance : 0));
  return { to, steps, coords, at, stepAt, dist: at[at.length - 1] || route.distance, dur: route.duration };
}

const SEARCH_BACK = 5; // ennyi szakasszal az előző találat előttről is keresünk
const SEARCH_AHEAD_STOP = 60; // ennyi szakasz után, ha már közel vagyunk, nem keresünk tovább
const CLOSE_ENOUGH_M = 15;

/**
 * A helyzet ráillesztése az útvonalra: legközelebbi pont, távolság a vonaltól, megtett táv, a szakasz iránya.
 * A keresés az előző találat környékén kezdődik, így egy önmagát keresztező útvonalnál nem ugrik vissza.
 */
export function snapToRoute(nav: Pick<Nav, "coords" | "at">, p: LatLon, from = 0): Snap {
  const c = nav.coords;
  const k = metersPerDegree(p.lat);
  let best = { d: Infinity, i: 0, t: 0 };
  const lo = Math.max(0, from - SEARCH_BACK);
  for (let i = lo; i < c.length - 1; i++) {
    const ax = (c[i][1] - p.lon) * k.x;
    const ay = (c[i][0] - p.lat) * k.y;
    const dx = (c[i + 1][1] - p.lon) * k.x - ax;
    const dy = (c[i + 1][0] - p.lat) * k.y - ay;
    const len2 = dx * dx + dy * dy;
    const t = len2 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2)) : 0;
    const d = Math.hypot(ax + t * dx, ay + t * dy);
    if (d < best.d) best = { d, i, t };
    if (i > lo + SEARCH_AHEAD_STOP && best.d < CLOSE_ENOUGH_M) break;
  }
  if (c.length < 2) return { dist: best.d, i: 0, pt: c[0], along: 0, seg: 0 };
  const { i, t } = best;
  const pt: [number, number] = [c[i][0] + t * (c[i + 1][0] - c[i][0]), c[i][1] + t * (c[i + 1][1] - c[i][1])];
  return {
    dist: best.d,
    i,
    pt,
    along: nav.at[i] + t * (nav.at[i + 1] - nav.at[i]),
    seg: bearingDeg(toLatLon(c[i]), toLatLon(c[i + 1])),
  };
}

/** A következő, még előttünk lévő manőver indexe a megtett táv alapján. */
export function upcomingStepIndex(nav: Pick<Nav, "stepAt" | "steps">, along: number): number {
  const i = nav.stepAt.findIndex((a, k) => k >= 1 && a > along + 4);
  return i < 0 ? nav.steps.length - 1 : i;
}

/** Ennyi méteren belül számít úgy, hogy az útvonalon vagyunk (a GPS pontosságához igazítva). */
export function onRouteTolerance(accuracyM: number | undefined): number {
  return Math.max(25, Math.min(accuracyM ?? 0, 45));
}
