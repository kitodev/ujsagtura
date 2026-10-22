// Kiskunhalas utcáinak és házszámainak betöltése az OpenStreetMap adataiból (Overpass), és címek elhelyezése rajtuk.
export type Pt = { lat: number; lon: number };
export type Found = Pt & { kind: "pontos" | "becsült" | "utca" | "terület" };
type El = { type: string; lat?: number; lon?: number; center?: Pt; tags?: Record<string, string> };
type Street = { name: string; full: string[]; stripped: string[]; centers: Pt[]; addr: { n: number; raw: string; pt: Pt }[] };
export type Index = { streets: Map<string, Street>; places: Map<string, Pt>; loaded: Set<string>; bbox: boolean };

const SUFFIX = new Set(["utca", "ut", "ter", "tere", "koz", "korut", "krt", "sor", "setany", "fasor", "dulo", "park", "lakotelep"]);
export const norm = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9./ -]/g, " ").replace(/\s+/g, " ").trim();
export const toks = (s: string) => norm(s).split(" ").filter(Boolean);
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
  return { streets, places, loaded: new Set(), bbox: false };
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

export function findStreet(ix: Index, q: string[]): Street | null {
  let best: Street | null = null, bs = 99;
  for (const s of ix.streets.values()) {
    const sc = score(q, s);
    if (sc < 0) continue;
    if (sc < bs || (sc === bs && best && s.centers.length + s.addr.length > best.centers.length + best.addr.length)) { best = s; bs = sc; }
  }
  return best;
}

export function locateIn(ix: Index, addr: string): Found | null {
  const { street, house } = parseAddr(addr);
  const q = toks(street);
  if (!q.length) return null;
  const best = findStreet(ix, q);
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

// --- Overpass lekérés (több tükörszerverrel). Két lépésben: 1) utcák és területek (kicsi), 2) házszámok csak a kellő utcákra ---
const EP = ["https://overpass-api.de/api/interpreter", "https://overpass.private.coffee/api/interpreter", "https://overpass.kumi.systems/api/interpreter"];
const AREA = `area["boundary"="administrative"]["admin_level"="8"]["name"="Kiskunhalas"]->.a;`;
const BBOX = "(46.36,19.38,46.52,19.62)";

// Az összes tükörszervert egyszerre kérdezzük, az első jó válasz nyer (nem várunk sorban egymás után).
async function overpass(q: string, ms: number, until: number): Promise<El[]> {
  const errs: string[] = [];
  const one = async (u: string) => {
    const host = new URL(u).host;
    try {
      const r = await fetch(u, {
        method: "POST", body: "data=" + encodeURIComponent(q),
        headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "ujsagtura/1.0 (hirlap-kezbesito alkalmazas)" },
        signal: AbortSignal.timeout(Math.max(3000, Math.min(ms, until - Date.now()))),
      });
      if (!r.ok) throw new Error(String(r.status));
      const j = (await r.json()) as { elements: El[]; remark?: string };
      if (j.remark && /error|timed out|out of memory/i.test(j.remark)) throw new Error(j.remark);
      return j.elements;
    } catch (e) { errs.push(`${host}: ${e instanceof Error ? e.message : e}`); throw e; }
  };
  for (let round = 0; round < 2 && Date.now() + 5000 < until; round++) {
    try { return await Promise.any(EP.map(one)); } catch { /* minden szerver hibázott – még egy kör, ha van idő */ }
  }
  throw new Error("Az OpenStreetMap szerver nem érhető el (" + errs.slice(-3).join("; ") + "). Próbáld újra egy perc múlva.");
}

// --- Tartós tárolás az adatbázisban: ha egyszer sikerült letölteni, utána nem kell az Overpass ---
async function dbc() {
  const { db } = await import("@/lib/db");
  const sql = db();
  await sql`create table if not exists osm_cache (key text primary key, data jsonb not null, t timestamptz default now())`;
  return sql;
}
async function saveCache(key: string, data: El[]) {
  try { const sql = await dbc(); await sql`insert into osm_cache(key, data) values (${key}, ${JSON.stringify(data)}::jsonb) on conflict (key) do update set data = excluded.data, t = now()`; } catch { /* a tárolás hibája nem akadályozza a működést */ }
}
function addHouses(ix: Index, els: El[]) {
  for (const e of els) {
    const t = e.tags ?? {};
    const pt = e.center ?? (e.lat != null && e.lon != null ? { lat: e.lat, lon: e.lon } : null);
    const st = pt && t["addr:street"] ? ix.streets.get(norm(t["addr:street"])) : null;
    if (st && pt) st.addr.push({ n: num(t["addr:housenumber"] ?? ""), raw: norm(t["addr:housenumber"] ?? ""), pt });
  }
}

let cache: { t: number; ix: Index } | null = null;
const FRESH = 30 * 24 * 3600 * 1000; // 30 napig nem töltjük újra (az utcák ritkán változnak)
export async function getIndex(): Promise<Index> {
  if (cache && Date.now() - cache.t < 30 * 60 * 1000) return cache.ix;
  type Row = { data: El[]; t: string };
  let stored: Row | null = null, houses: { key: string; data: El[] }[] = [];
  try {
    const sql = await dbc();
    stored = ((await sql`select data, t from osm_cache where key = 'streets'`)[0] as unknown as Row | undefined) ?? null;
    if (stored) houses = (await sql`select key, data from osm_cache where key like 'addr:%'`) as unknown as typeof houses;
  } catch { /* nincs adatbázis-kapcsolat: marad az online lekérés */ }
  let els: El[];
  if (stored && Date.now() - new Date(stored.t).getTime() < FRESH) els = stored.data;
  else {
    const q = `[out:json][timeout:25]; (way["highway"]["name"]${BBOX}; nwr["place"]["name"]${BBOX};); out center tags;`;
    try {
      els = await overpass(q, 25000, Date.now() + 35000);
      if (els.length) await saveCache("streets", els);
    } catch (e) {
      if (!stored) throw e;
      els = stored.data; // régi mentett adat jobb, mint a semmi
    }
  }
  const ix = buildIndex(els);
  ix.bbox = true;
  for (const h of houses) { addHouses(ix, h.data); ix.loaded.add(h.key.slice(5)); }
  if (ix.streets.size) cache = { t: Date.now(), ix };
  return ix;
}

// Házszámok betöltése a megadott utcákra. Hiba esetén false (az utcaszintű találat ilyenkor is használható).
export async function loadAddresses(ix: Index, keys: string[], until: number): Promise<boolean> {
  const names = keys.map((k) => ix.streets.get(k)?.name).filter(Boolean) as string[];
  if (!names.length) return true;
  const re = names.map((n) => n.replace(/[.*+?^${}()|[\]\\"]/g, "\\$&")).join("|");
  const area = !ix.bbox;
  const q = `[out:json][timeout:40]; ${area ? AREA : ""} nwr["addr:housenumber"]["addr:street"~"^(${re})$"]${area ? "(area.a)" : BBOX}; out center tags;`;
  try {
    const els = await overpass(q, 25000, until);
    addHouses(ix, els);
    keys.forEach((k) => ix.loaded.add(k));
    // utcánként elmentjük, hogy legközelebb ne kelljen letölteni
    for (const k of keys) {
      const nm = ix.streets.get(k)?.name;
      await saveCache("addr:" + k, els.filter((e) => e.tags?.["addr:street"] === nm));
    }
    return true;
  } catch { return false; }
}
