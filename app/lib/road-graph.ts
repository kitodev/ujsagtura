// Offline útvonaltervezés: Kiskunhalas úthálózata (OpenStreetMap) a telefonon, internet nélkül.
// A szerver egyszer letölti az utakat (lásd api/roads), a kliens ebből keres legrövidebb utat (A*),
// és a navigációhoz ugyanolyan formájú útvonalat ad, mint az online útvonaltervező (OSRM).
import { bearingDeg, distanceM, metersPerDegree, type LatLon } from "./geo";
import type { OsrmRoute, Step } from "./navigation";

/** Tömör úthálózat (JSON-ban így utazik). */
export type CompactGraph = {
  v: 1;
  /** [lat0, lon0, lat1, lon1, …] */
  nodes: number[];
  /** [a, b, utcanév-index, egyirányú (0 = mindkét irány, 1 = a→b, -1 = b→a), …] */
  edges: number[];
  names: string[];
};

/** Overpass „out geom” elem (út). */
export type OverpassWay = {
  type: string;
  id: number;
  nodes?: number[];
  geometry?: { lat: number; lon: number }[];
  tags?: Record<string, string>;
};

/** Autóval járható úttípusok. */
export const DRIVABLE =
  /^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|service|road|track|(motorway|trunk|primary|secondary|tertiary)_link)$/;

const round6 = (x: number) => Math.round(x * 1e6) / 1e6;

function onewayOf(tags: Record<string, string>): 0 | 1 | -1 {
  const o = tags.oneway;
  if (o === "-1" || o === "reverse") return -1;
  if (o === "yes" || o === "1" || o === "true") return 1;
  if (o !== "no" && (tags.junction === "roundabout" || tags.junction === "circular")) return 1;
  return 0;
}

/** Overpass utakból tömör gráf. Az utak a közös OSM-csomópontokon kapcsolódnak. */
export function buildCompactGraph(ways: OverpassWay[]): CompactGraph {
  const index = new Map<number, number>();
  const nodes: number[] = [];
  const edges: number[] = [];
  const names: string[] = [];
  const nameIndex = new Map<string, number>();
  const nodeOf = (id: number, lat: number, lon: number) => {
    let i = index.get(id);
    if (i == null) {
      i = nodes.length / 2;
      index.set(id, i);
      nodes.push(round6(lat), round6(lon));
    }
    return i;
  };
  for (const w of ways) {
    const tags = w.tags ?? {};
    if (w.type !== "way" || !DRIVABLE.test(tags.highway ?? "") || !w.nodes || !w.geometry) continue;
    if (tags.access === "no" || tags.access === "private" || tags.motor_vehicle === "no") continue;
    const name = tags.name ?? tags.ref ?? "";
    let ni = nameIndex.get(name);
    if (ni == null) {
      ni = names.length;
      names.push(name);
      nameIndex.set(name, ni);
    }
    const oneway = onewayOf(tags);
    for (let k = 1; k < w.nodes.length; k++) {
      const a = nodeOf(w.nodes[k - 1], w.geometry[k - 1].lat, w.geometry[k - 1].lon);
      const b = nodeOf(w.nodes[k], w.geometry[k].lat, w.geometry[k].lon);
      if (a !== b) edges.push(a, b, ni, oneway);
    }
  }
  return { v: 1, nodes, edges, names };
}

type Arc = { to: number; len: number; name: number };
type Edge = { a: number; b: number; len: number; name: number; oneway: number };
/** Pont az úton: melyik szakaszon, és a szakasz mely részén (t: 0 = eleje, 1 = vége). */
type Snap = { edge: Edge; t: number; dist: number; pt: LatLon };

/** Átlagos városi sebesség az időbecsléshez (m/s ≈ 30 km/h). */
const SPEED_MS = 8.3;
/** Utcanév-váltásnál ennél nagyobb irányváltás kanyar (fok); kisebbnél „egyenesen”. */
const TURN_DEG = 35;
/** Ugyanazon az utcán csak ennél élesebb kanyart mondunk be (a kanyargós utca ne „kanyarogjon” folyton). */
const SAME_STREET_TURN_DEG = 60;

/** Bináris kupac a legkisebb költségű csomópont gyors kivételéhez. */
class MinHeap {
  private items: [number, number][] = [];
  get size() {
    return this.items.length;
  }
  push(key: number, value: number) {
    const a = this.items;
    a.push([key, value]);
    for (let i = a.length - 1; i > 0; ) {
      const p = (i - 1) >> 1;
      if (a[p][0] <= a[i][0]) break;
      [a[p], a[i]] = [a[i], a[p]];
      i = p;
    }
  }
  pop(): [number, number] {
    const a = this.items;
    const top = a[0];
    const last = a.pop()!;
    if (a.length) {
      a[0] = last;
      for (let i = 0; ; ) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && a[l][0] < a[m][0]) m = l;
        if (r < a.length && a[r][0] < a[m][0]) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        i = m;
      }
    }
    return top;
  }
}

/** Turn angle (−180…180, jobbra pozitív) egyik irányból a másikba. */
export const turnAngle = (from: number, to: number) => ((to - from + 540) % 360) - 180;

/** Kanyar → OSRM-szerű irány. */
export function turnModifier(angle: number): string {
  const a = Math.abs(angle);
  const side = angle > 0 ? "right" : "left";
  if (a < 20) return "straight";
  if (a < 45) return `slight ${side}`;
  if (a < 135) return side;
  if (a < 165) return `sharp ${side}`;
  return "uturn";
}

export class RoadGraph {
  readonly points: LatLon[];
  private readonly adj: Arc[][];
  private readonly edgeList: Edge[] = [];
  readonly names: string[];

  constructor(g: CompactGraph) {
    this.names = g.names;
    this.points = [];
    for (let i = 0; i < g.nodes.length; i += 2) this.points.push({ lat: g.nodes[i], lon: g.nodes[i + 1] });
    this.adj = this.points.map(() => []);
    for (let i = 0; i < g.edges.length; i += 4) {
      const [a, b, name, oneway] = g.edges.slice(i, i + 4);
      const len = distanceM(this.points[a], this.points[b]);
      this.edgeList.push({ a, b, len, name, oneway });
      if (oneway !== -1) this.adj[a].push({ to: b, len, name });
      if (oneway !== 1) this.adj[b].push({ to: a, len, name });
    }
  }

  get size() {
    return this.points.length;
  }

  /** A ponthoz legközelebbi útszakasz, és rajta a legközelebbi pont. */
  nearestEdge(p: LatLon): Snap | null {
    const k = metersPerDegree(p.lat);
    let best: Snap | null = null;
    for (const e of this.edgeList) {
      const a = this.points[e.a];
      const b = this.points[e.b];
      // gyors előszűrés: a szakasz befoglaló téglalapja túl messze van
      const dLat = Math.max(0, Math.min(a.lat, b.lat) - p.lat, p.lat - Math.max(a.lat, b.lat)) * k.y;
      const dLon = Math.max(0, Math.min(a.lon, b.lon) - p.lon, p.lon - Math.max(a.lon, b.lon)) * k.x;
      if (best && Math.max(dLat, dLon) > best.dist) continue;
      const ax = (a.lon - p.lon) * k.x;
      const ay = (a.lat - p.lat) * k.y;
      const dx = (b.lon - a.lon) * k.x;
      const dy = (b.lat - a.lat) * k.y;
      const len2 = dx * dx + dy * dy;
      const t = len2 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2)) : 0;
      const dist = Math.hypot(ax + t * dx, ay + t * dy);
      if (!best || dist < best.dist) {
        best = { edge: e, t, dist, pt: { lat: a.lat + t * (b.lat - a.lat), lon: a.lon + t * (b.lon - a.lon) } };
      }
    }
    return best;
  }

  /**
   * Legrövidebb út két útra illesztett pont között (A*).
   * Az eredmény: a csomópontok sorban, és az egyes szakaszok utcanevei (a kezdő- és célszakasszal együtt).
   */
  private shortestPath(from: Snap, to: Snap): { path: number[]; names: number[] } | null {
    const { edge: fe, t: ft } = from;
    const { edge: te, t: tt } = to;
    // ugyanazon a szakaszon, megengedett irányban: nincs köztes csomópont
    if (fe === te && (fe.oneway === 0 || (fe.oneway === 1 ? tt >= ft : tt <= ft)))
      return { path: [], names: [fe.name] };

    const n = this.points.length;
    const dist = new Float64Array(n).fill(Infinity);
    const prev = new Int32Array(n).fill(-1);
    const via = new Int32Array(n).fill(-1);
    const goal = to.pt;
    const heap = new MinHeap();
    const start = (node: number, cost: number) => {
      if (cost < dist[node]) {
        dist[node] = cost;
        heap.push(cost + distanceM(this.points[node], goal), node);
      }
    };
    if (fe.oneway !== 1) start(fe.a, ft * fe.len); // visszafelé a szakasz elejére
    if (fe.oneway !== -1) start(fe.b, (1 - ft) * fe.len); // előre a szakasz végére
    const exits: [number, number][] = []; // [csomópont, maradék a célig]
    if (te.oneway !== -1) exits.push([te.a, tt * te.len]);
    if (te.oneway !== 1) exits.push([te.b, (1 - tt) * te.len]);

    let bestEnd = -1;
    let bestCost = Infinity;
    while (heap.size) {
      const [estimate, u] = heap.pop();
      if (estimate - distanceM(this.points[u], goal) > dist[u] + 1e-6) continue; // elavult bejegyzés
      if (estimate >= bestCost) break; // a hátralévő utak már nem lehetnek rövidebbek
      for (const [node, rest] of exits) {
        if (node === u && dist[u] + rest < bestCost) {
          bestCost = dist[u] + rest;
          bestEnd = u;
        }
      }
      for (const arc of this.adj[u]) {
        const d = dist[u] + arc.len;
        if (d < dist[arc.to]) {
          dist[arc.to] = d;
          prev[arc.to] = u;
          via[arc.to] = arc.name;
          heap.push(d + distanceM(this.points[arc.to], goal), arc.to);
        }
      }
    }
    if (bestEnd < 0) return null;
    const path = [bestEnd];
    const names: number[] = [te.name];
    for (let v = bestEnd; prev[v] >= 0; v = prev[v]) {
      names.unshift(via[v]);
      path.unshift(prev[v]);
    }
    names.unshift(fe.name);
    return { path, names };
  }

  /**
   * Útvonal két pont között, az online útvonaltervező formájában (vonal + manőverek).
   * A kezdő- és célpontot a legközelebbi útra illeszti; a ház és az út közti rövid darab is a vonal része.
   */
  route(from: LatLon, to: LatLon): OsrmRoute | null {
    const a = this.nearestEdge(from);
    const b = this.nearestEdge(to);
    if (!a || !b) return null;
    const found = this.shortestPath(a, b);
    if (!found) return null;

    // az úton haladó pontok és szakaszaik utcaneve
    const road: LatLon[] = [a.pt, ...found.path.map((i) => this.points[i]), b.pt];
    const roadNames = found.names;
    const len = (p: LatLon[]) => p.slice(1).reduce((sum, q, i) => sum + distanceM(p[i], q), 0);
    const nameOf = (i: number) => this.names[i] ?? "";
    const loc = (p: LatLon): [number, number] => [p.lon, p.lat];

    // manőverek: utcanév-váltásnál mindig, ugyanazon az utcán csak határozott kanyarnál
    const steps: Step[] = [
      { name: nameOf(roadNames[0]), distance: 0, maneuver: { type: "depart", location: loc(from) } },
    ];
    let stepFrom = 0;
    for (let k = 1; k < road.length - 1; k++) {
      const inLen = distanceM(road[k - 1], road[k]);
      const outLen = distanceM(road[k], road[k + 1]);
      if (inLen < 1 || outLen < 1) continue;
      const angle = turnAngle(bearingDeg(road[k - 1], road[k]), bearingDeg(road[k], road[k + 1]));
      const renamed = nameOf(roadNames[k]) !== nameOf(roadNames[k - 1]);
      if (!renamed && Math.abs(angle) < SAME_STREET_TURN_DEG) continue;
      if (renamed && !nameOf(roadNames[k]) && Math.abs(angle) < TURN_DEG) continue; // névtelen bekötőút egyenesen
      steps[steps.length - 1].distance = len(road.slice(stepFrom, k + 1));
      stepFrom = k;
      const modifier = turnModifier(angle);
      steps.push({
        name: nameOf(roadNames[k]),
        distance: 0,
        maneuver: { type: modifier === "straight" ? "continue" : "turn", modifier, location: loc(road[k]) },
      });
    }
    steps[steps.length - 1].distance = len(road.slice(stepFrom));
    steps.push({ name: "", distance: 0, maneuver: { type: "arrive", location: loc(to) } });

    const line = [from, ...road, to];
    const distance = len(line);
    return {
      geometry: { coordinates: line.map((p) => [p.lon, p.lat]) },
      legs: [{ steps }],
      distance,
      duration: distance / SPEED_MS,
    };
  }

  /** Útvonal több ponton át (a térkép útvonalvonalához). */
  routeThrough(points: LatLon[]): OsrmRoute | null {
    const coords: number[][] = [];
    let distance = 0;
    for (let i = 1; i < points.length; i++) {
      const leg = this.route(points[i - 1], points[i]);
      if (!leg) return null;
      coords.push(...(i === 1 ? leg.geometry.coordinates : leg.geometry.coordinates.slice(1)));
      distance += leg.distance;
    }
    return { geometry: { coordinates: coords }, legs: [{ steps: [] }], distance, duration: distance / SPEED_MS };
  }
}
