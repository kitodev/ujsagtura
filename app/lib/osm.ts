// Kiskunhalas utcáinak és házszámainak betöltése az OpenStreetMap adataiból (Overpass), és címek elhelyezése rajtuk.
export type Pt = { lat: number; lon: number };
export type Found = Pt & { kind: "pontos" | "becsült" | "utca" | "terület" };
type El = { type: string; lat?: number; lon?: number; center?: Pt; tags?: Record<string, string> };
type Street = { name: string; full: string[]; stripped: string[]; centers: Pt[]; addr: { n: number; raw: string; pt: Pt }[] };
export type Index = { streets: Map<string, Street>; places: Map<string, Pt> };

const SUFFIX = new Set(["utca", "ut", "ter", "tere", "koz", "korut", "krt", "sor", "setany", "fasor", "dulo", "park", "lakotelep"]);
export const norm = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9./ -]/g, " ").replace(/\s+/g, " ").trim();
const toks = (s: string) => norm(s).split(" ").filter(Boolean);
const num = (h: string) => { const m = h.match(/^\d+/); return m ? +m[0] : NaN; };
const tokEq = (q: string, o: string) => q === o || (q.endsWith(".") && o.startsWith(q.slice(0, -1)));

export function buildIndex(els: El[]): Index {
  const streets = new Map<string, Street>(), places = new Map<string, Pt>();
  const get = (name: string) => {
    const k = norm(name);
    let s = streets.get(k);
    if (!s) {
      const full = toks(name);
      s = { name, full, stripped: SUFFIX.has(full[full.length - 1]) ? full.slice(0, -1) : full, centers: [], addr: [] };
      streets.set(k, s);
    }
    return s;
  };
  for (const e of els) {
    const t = e.tags ?? {};
    const pt = e.center ?? (e.lat != null && e.lon != null ? { lat: e.lat, lon: e.lon } : null);
    if (!pt) continue;
    if (t.highway && t.name) get(t.name).centers.push(pt);
    else if (t["addr:housenumber"] && t["addr:street"]) get(t["addr:street"]).addr.push({ n: num(t["addr:housenumber"]), raw: norm(t["addr:housenumber"]), pt });
    else if (t.place && t.name) places.set(norm(t.name), pt);
  }
  return { streets, places };
}

function score(q: string[], s: Street): number {
  const eq = (a: string[], b: string[]) => a.length === b.length && a.every((t, i) => tokEq(t, b[i]));
  if (eq(q, s.full)) return 0;
  if (eq(q, s.stripped)) return 1;
  if (q.length <= s.full.length && q.every((t, i) => tokEq(t, s.full[i]))) return 2 + s.full.length - q.length;
  return -1;
}
function centerOf(s: Street): Pt | null {
  const pts = s.centers.length ? s.centers : s.addr.map((a) => a.pt);
  if (!pts.length) return null;
  const c = { lat: pts.reduce((x, p) => x + p.lat, 0) / pts.length, lon: pts.reduce((x, p) => x + p.lon, 0) / pts.length };
  const d2 = (p: Pt) => (p.lat - c.lat) ** 2 + (p.lon - c.lon) ** 2;
  return pts.reduce((b, p) => (d2(p) < d2(b) ? p : b));
}
export function parseAddr(addr: string) {
  const s = addr.replace(/\(.*?\)/g, "").split("–")[0].trim();
  const m = s.match(/^(.*?)\s+(\d[\w/-]*)\.?$/);
  return { street: m ? m[1] : s.replace(/\.$/, ""), house: m ? m[2] : null };
}

export function locateIn(ix: Index, addr: string): Found | null {
  const { street, house } = parseAddr(addr);
  const q = toks(street);
  if (!q.length) return null;
  let best: Street | null = null, bs = 99;
  for (const s of ix.streets.values()) {
    const sc = score(q, s);
    if (sc < 0) continue;
    if (sc < bs || (sc === bs && best && s.centers.length + s.addr.length > best.centers.length + best.addr.length)) { best = s; bs = sc; }
  }
  if (!best) {
    const k = norm(street);
    const p = [...ix.places.entries()].find(([n]) => n === k || n.startsWith(k));
    return p ? { ...p[1], kind: "terület" } : null;
  }
  if (house) {
    const raw = norm(house), n = num(house);
    const ex = best.addr.find((a) => a.raw === raw) ?? best.addr.find((a) => a.n === n);
    if (ex) return { ...ex.pt, kind: "pontos" };
    const nums = best.addr.filter((a) => !isNaN(a.n));
    if (nums.length && !isNaN(n)) {
      const same = nums.filter((a) => a.n % 2 === n % 2);
      const pool = same.length ? same : nums;
      const lo = pool.filter((a) => a.n < n).sort((a, b) => b.n - a.n)[0];
      const hi = pool.filter((a) => a.n > n).sort((a, b) => a.n - b.n)[0];
      if (lo && hi) {
        const t = (n - lo.n) / (hi.n - lo.n);
        return { lat: lo.pt.lat + t * (hi.pt.lat - lo.pt.lat), lon: lo.pt.lon + t * (hi.pt.lon - lo.pt.lon), kind: "becsült" };
      }
      const one = lo ?? hi;
      if (one) return { ...one.pt, kind: "becsült" };
    }
  }
  const c = centerOf(best);
  return c ? { ...c, kind: "utca" } : null;
}

// --- Overpass lekérés (több tükörszerverrel), a feldolgozott index 30 percig a memóriában marad ---
const EP = ["https://overpass-api.de/api/interpreter", "https://overpass.private.coffee/api/interpreter", "https://overpass.kumi.systems/api/interpreter"];
const BODY = `(way["highway"]["name"]AREA; nwr["addr:housenumber"]["addr:street"]AREA; nwr["place"]["name"]AREA;); out center tags;`;
const QUERIES = [
  `[out:json][timeout:25]; area["boundary"="administrative"]["admin_level"="8"]["name"="Kiskunhalas"]->.a; ${BODY.replaceAll("AREA", "(area.a)")}`,
  `[out:json][timeout:25]; ${BODY.replaceAll("AREA", "(46.36,19.38,46.52,19.62)")}`,
];
async function overpass(q: string): Promise<El[]> {
  let err = "";
  for (const u of EP) {
    try {
      const r = await fetch(u, {
        method: "POST", body: "data=" + encodeURIComponent(q),
        headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "ujsagtura/1.0 (hirlap-kezbesito alkalmazas)" },
        signal: AbortSignal.timeout(18000),
      });
      if (!r.ok) { err = `${new URL(u).host}: ${r.status}`; continue; }
      return ((await r.json()) as { elements: El[] }).elements;
    } catch (e) { err = `${new URL(u).host}: ${e instanceof Error ? e.message : e}`; }
  }
  throw new Error("Az OpenStreetMap szerver nem érhető el (" + err + "). Próbáld újra egy perc múlva.");
}
let cache: { t: number; ix: Index } | null = null;
export async function getIndex(): Promise<Index> {
  if (cache && Date.now() - cache.t < 30 * 60 * 1000) return cache.ix;
  let els = await overpass(QUERIES[0]);
  if (!els.some((e) => e.tags?.highway)) els = await overpass(QUERIES[1]);
  const ix = buildIndex(els);
  if (ix.streets.size) cache = { t: Date.now(), ix };
  return ix;
}
