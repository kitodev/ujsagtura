// Jelölések (Leadva / Hiányzik / Lemondva) szabályai.
import type { Deliveries, Status, StatusFilter, Stop } from "./types";

export const STATUS_LABEL: Record<Status, string> = {
  delivered: "Leadva",
  missing: "Hiányzik",
  cancelled: "Lemondva",
};

/** Koppintásra a jelölés körbe jár: jelöletlen → Leadva → Hiányzik → Lemondva → jelöletlen. */
export function nextStatus(current: Status | undefined): Status | null {
  switch (current) {
    case undefined:
      return "delivered";
    case "delivered":
      return "missing";
    case "missing":
      return "cancelled";
    default:
      return null;
  }
}

/** Új jelölések egy újság átállítása után (null = jelölés törlése). */
export function withStatus(d: Deliveries, paperId: string, status: Status | null): Deliveries {
  const next = { ...d };
  if (status) next[paperId] = status;
  else delete next[paperId];
  return next;
}

/** Minden újság jelölve van (bármilyen jelöléssel) – a cím elintézett. */
export const isHandled = (s: Stop, d: Deliveries) => s.stop_papers.every((p) => d[p.id]);

/** Van még jelöletlen újság a címen. */
export const isPending = (s: Stop, d: Deliveries) => s.stop_papers.some((p) => !d[p.id]);

/** Van-e jelölés a címen (részben kezelt). */
export const isTouched = (s: Stop, d: Deliveries) => s.stop_papers.some((p) => d[p.id]);

/** A cím megfelel-e a lista szűrőjének. */
export function matchesFilter(s: Stop, d: Deliveries, filter: StatusFilter): boolean {
  if (!filter) return true;
  return s.stop_papers.some((p) => (filter === "todo" ? !d[p.id] : d[p.id] === filter));
}

export type StatusCounts = Record<"todo" | Status, number>;

/** Újságok száma állapotonként. */
export function countByStatus(stops: Stop[], d: Deliveries): StatusCounts {
  const c: StatusCounts = { todo: 0, delivered: 0, missing: 0, cancelled: 0 };
  for (const s of stops) for (const p of s.stop_papers) c[d[p.id] ?? "todo"]++;
  return c;
}

/**
 * A következő elintézetlen, helyadattal rendelkező cím a megadott sorrendben, `afterId` után (körbefordulva).
 * `afterId` = null esetén az első ilyen cím.
 */
export function nextStopAfter(order: Stop[], afterId: string | null, d: Deliveries): Stop | null {
  const n = order.length;
  const start = afterId ? order.findIndex((s) => s.id === afterId) : -1;
  for (let k = 1; k <= n; k++) {
    const s = order[(start + k + n) % n];
    if (s.id !== afterId && s.lat != null && s.lon != null && isPending(s, d)) return s;
  }
  return null;
}

/** A lista sorrendje: ha van újraszámolt („hátralévő”) sorrend, az kerül előre. */
export function orderedStops(stops: Stop[], preferredIds: string[]): Stop[] {
  if (!preferredIds.length) return stops;
  const byId = new Map(stops.map((s) => [s.id, s]));
  const first = preferredIds.map((id) => byId.get(id)).filter((s): s is Stop => !!s);
  const rest = stops.filter((s) => !preferredIds.includes(s.id));
  return [...first, ...rest];
}

/** „(10.21. óta)” – örökölt lemondás felirata. */
export function sinceLabel(sinceDay: string | undefined): string {
  return sinceDay ? ` (${sinceDay.slice(5).replace("-", ".")}. óta)` : "";
}

/** Az Összesítő szövege: a hiányzó és lemondott újságok listája. */
export function summaryText(stops: Stop[], d: Deliveries, day: string, route: string): string {
  const lines = stops.flatMap((s) =>
    s.stop_papers
      .filter((p) => d[p.id] && d[p.id] !== "delivered")
      .map((p) => `${s.address} – ${p.paper}: ${STATUS_LABEL[d[p.id]]}`),
  );
  return `Összesítő – ${day} – ${route}\n\n${lines.join("\n") || "Nincs hiányzó vagy lemondott újság."}`;
}
