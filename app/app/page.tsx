"use client";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Pin } from "@/components/Map";
import Scan from "@/components/Scan";
import StopForm, { type Meta } from "@/components/StopForm";
import { HIDDEN_ROUTES } from "@/lib/hidden";

const api = async (u: string, m = "GET", b?: unknown) => {
  const r = await fetch(u, { method: m, headers: { "Content-Type": "application/json" }, body: b ? JSON.stringify(b) : undefined });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
};
const MapView = dynamic(() => import("@/components/Map"), { ssr: false });

type Paper = { id: string; paper: string };
type Stop = { id: string; route_id?: string; position: number; address: string; name: string; note: string; lat: number | null; lon: number | null; stop_papers: Paper[] };
type Route = { id: string; name: string; note: string };
const NEXT: Record<string, string | null> = { "": "delivered", delivered: "missing", missing: "cancelled", cancelled: null };
const LABEL: Record<string, string> = { delivered: "Leadva", missing: "Hiányzik", cancelled: "Lemondva" };
type Step = { name: string; distance: number; maneuver: { type: string; modifier?: string; exit?: number; location: [number, number] } };
// at: a vonal pontjainak távolsága az útvonal elejétől (m); stepAt: az egyes manőverek távolsága az elejétől (m)
type Nav = { to: Stop; steps: Step[]; coords: [number, number][]; at: number[]; stepAt: number[]; dist: number; dur: number };
const ICON: Record<string, string> = { left: "⬅", right: "➡", "slight left": "↖", "slight right": "↗", "sharp left": "↙", "sharp right": "↘", uturn: "↶", straight: "⬆" };
function stepIcon(s: Step) {
  const m = s.maneuver;
  if (m.type === "arrive") return "⚑";
  if (m.type === "roundabout" || m.type === "rotary") return "⟳";
  return ICON[m.modifier ?? "straight"] ?? "⬆";
}
const fmtDist = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.max(0, Math.round(m / 10) * 10)} m`);
const MOD: Record<string, string> = { left: "balra", right: "jobbra", "slight left": "enyhén balra", "slight right": "enyhén jobbra", "sharp left": "élesen balra", "sharp right": "élesen jobbra" };
function stepText(s: Step) {
  const m = s.maneuver, n = s.name ? ` – ${s.name}` : "";
  if (m.type === "depart") return `Indulj el${n}`;
  if (m.type === "arrive") return "Megérkeztél";
  if (m.type === "roundabout" || m.type === "rotary") return `Körforgalomban hajts ki a ${m.exit ?? ""}. kijáraton${n}`;
  if (m.modifier === "uturn") return "Fordulj vissza";
  if (!m.modifier || m.modifier === "straight" || m.type === "continue") return `Haladj egyenesen${n}`;
  return `Fordulj ${MOD[m.modifier] ?? "tovább"}${n}`;
}
const geoKey = (a: string) => a.replace(/\(.*?\)/g, "").split("–")[0].replace(/\.$/, "").trim();
// Cím ellenőrzése és elhelyezése a kiskunhalasi térképadatok alapján (szerver oldalon)
async function verify(addr: string): Promise<{ lat: number; lon: number } | null> {
  try {
    const r = await api("/api/locate", "POST", { addresses: [addr] });
    const x = r.results[addr];
    return x ? { lat: x.lat, lon: x.lon } : null;
  } catch { return null; }
}
// Ideiglenesen kivett túrák listája: lib/hidden.ts
const HIDDEN = new Set(HIDDEN_ROUTES);
const visRoutes = <T extends { id: string }>(xs: T[]) => xs.filter((r) => !HIDDEN.has(r.id));
const visStops = <T extends { route_id?: string }>(xs: T[]) => xs.filter((s) => !HIDDEN.has(s.route_id ?? ""));
async function nominatim(addr: string): Promise<{ lat: number; lon: number; kind: string } | null> {
  try {
    const j: { lat: string; lon: string; address?: { house_number?: string; road?: string } }[] = await (await fetch(
      `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=1&countrycodes=hu&viewbox=19.38,46.52,19.62,46.36&bounded=1&q=${encodeURIComponent(geoKey(addr) + ", Kiskunhalas")}`)).json();
    const m = j[0];
    return m ? { lat: +m.lat, lon: +m.lon, kind: m.address?.house_number ? "pontos" : "utca" } : null;
  } catch { return null; }
}
const hav = (a: { lat: number; lon: number }, b: { lat: number; lon: number }) => {
  const r = Math.PI / 180, x = (b.lat - a.lat) * r, y = (b.lon - a.lon) * r;
  const h = Math.sin(x / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(y / 2) ** 2;
  return 12742000 * Math.asin(Math.sqrt(h));
};

// Irányszög a-ból b-be (fok, 0 = észak, óramutató szerint)
const bearingOf = (a: LL, b: LL) => {
  const r = Math.PI / 180, y = Math.sin((b.lon - a.lon) * r) * Math.cos(b.lat * r);
  const x = Math.cos(a.lat * r) * Math.sin(b.lat * r) - Math.sin(a.lat * r) * Math.cos(b.lat * r) * Math.cos((b.lon - a.lon) * r);
  return ((Math.atan2(y, x) / r) + 360) % 360;
};
const angDiff = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180);
// A helyzet ráillesztése az útvonalra: legközelebbi pont, távolság a vonaltól, megtett táv, és az adott szakasz iránya.
// A keresést az előző találat környékén kezdjük, hogy egy önmagát keresztező útvonalnál ne ugorjon vissza.
function snapRoute(nav: Nav, p: LL, from = 0) {
  const c = nav.coords, kx = 111320 * Math.cos((p.lat * Math.PI) / 180), ky = 110540;
  let best = { d: Infinity, i: 0, t: 0 };
  const lo = Math.max(0, from - 5);
  for (let i = lo; i < c.length - 1; i++) {
    const ax = (c[i][1] - p.lon) * kx, ay = (c[i][0] - p.lat) * ky, bx = (c[i + 1][1] - p.lon) * kx, by = (c[i + 1][0] - p.lat) * ky;
    const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
    const t = L ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / L)) : 0;
    const d = Math.hypot(ax + t * dx, ay + t * dy);
    if (d < best.d) best = { d, i, t };
    if (i > lo + 60 && best.d < 15) break; // messzebb már nem kell keresni
  }
  const { i, t } = best;
  const pt: [number, number] = c.length > 1 ? [c[i][0] + t * (c[i + 1][0] - c[i][0]), c[i][1] + t * (c[i + 1][1] - c[i][1])] : c[0];
  const along = c.length > 1 ? nav.at[i] + t * (nav.at[i + 1] - nav.at[i]) : 0;
  const seg = c.length > 1 ? bearingOf({ lat: c[i][0], lon: c[i][1] }, { lat: c[i + 1][0], lon: c[i + 1][1] }) : 0;
  return { dist: best.d, i, pt, along, seg };
}
function makeNav(to: Stop, r: { legs: { steps: Step[] }[]; geometry: { coordinates: number[][] }; distance: number; duration: number }): Nav {
  const coords = r.geometry.coordinates.map(([x, y]) => [y, x] as [number, number]);
  const at = [0];
  for (let i = 1; i < coords.length; i++) at.push(at[i - 1] + hav({ lat: coords[i - 1][0], lon: coords[i - 1][1] }, { lat: coords[i][0], lon: coords[i][1] }));
  const steps = r.legs[0].steps, stepAt: number[] = [];
  steps.forEach((s, k) => stepAt.push(k ? stepAt[k - 1] + steps[k - 1].distance : 0));
  return { to, steps, coords, at, stepAt, dist: at[at.length - 1] || r.distance, dur: r.duration };
}

// Útvonal-sorrend: legközelebbi szomszéd módszer, majd 2-opt javítás (kiveszi a kereszteződő, visszafelé menő szakaszokat).
// Ha van saját helyzet (GPS), onnan indul; ha nincs, azt a kezdőpontot választja, amelyikkel a legrövidebb az út.
type LL = { lat: number; lon: number };
function bestOrder<T extends LL>(pts: T[], start: LL | null): T[] {
  const n = pts.length;
  if (n < 2) return pts.slice();
  const D = pts.map((a) => pts.map((b) => hav(a, b)));
  const S = start ? pts.map((p) => hav(start, p)) : null;
  const len = (o: number[]) => (S ? S[o[0]] : 0) + o.slice(1).reduce((x, v, i) => x + D[o[i]][v], 0);
  const nn = (first: number) => {
    const used = new Set([first]), o = [first];
    while (o.length < n) {
      const l = o[o.length - 1];
      let b = -1, bd = Infinity;
      for (let j = 0; j < n; j++) if (!used.has(j) && D[l][j] < bd) { bd = D[l][j]; b = j; }
      o.push(b); used.add(b);
    }
    return o;
  };
  const twoOpt = (o: number[]) => {
    for (let round = 0, improved = true; improved && round < 50; round++) {
      improved = false;
      for (let i = 0; i < n - 1; i++) for (let j = i + 1; j < n; j++) {
        const pre = (k: number) => (i === 0 ? (S ? S[k] : 0) : D[o[i - 1]][k]);
        const post = (k: number) => (j === n - 1 ? 0 : D[k][o[j + 1]]);
        if (pre(o[j]) + post(o[i]) < pre(o[i]) + post(o[j]) - 0.5) {
          o.splice(i, j - i + 1, ...o.slice(i, j + 1).reverse());
          improved = true;
        }
      }
    }
    return o;
  };
  const all = [...Array(n).keys()];
  const starts = S ? [S.indexOf(Math.min(...S))] : n > 60 ? all.filter((i) => i % Math.ceil(n / 40) === 0) : all;
  let best = all, bl = Infinity;
  for (const f of starts) { const o = twoOpt(nn(f)); const l = len(o); if (l < bl) { bl = l; best = o; } }
  return best.map((i) => pts[i]);
}

export default function Page() {
  const day = useMemo(() => new Date().toLocaleDateString("sv-SE"), []);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [route, setRoute] = useState("");
  const [stops, setStops] = useState<Stop[]>([]);
  const [mapStops, setMapStops] = useState<Stop[]>([]);
  const [dv, setDv] = useState<Record<string, string>>({});
  const [only, setOnly] = useState(false);
  const [showMap, setShowMap] = useState(false);
  const [gps, setGps] = useState<{ lat: number; lon: number; acc?: number } | null>(null);
  const [last, setLast] = useState<Stop | null>(null);
  const [msg, setMsg] = useState("");
  const [sum, setSum] = useState("");
  const [meta, setMeta] = useState<Meta>({ papers: [], addresses: [], names: [] });
  const [q, setQ] = useState("");
  const [found, setFound] = useState<Stop[]>([]);
  const [tick, setTick] = useState(0);
  const [nav, setNav] = useState<Nav | null>(null);
  const [routeLine, setRouteLine] = useState<[number, number][] | null>(null);
  const [routeLineMsg, setRouteLineMsg] = useState("");
  const [idx, setIdx] = useState(0);
  const [voice, setVoice] = useState(false);
  const [heading, setHeading] = useState<number | null>(null); // menetirány (GPS / mozgás / iránytű)
  const [full, setFull] = useState(false);   // teljes képernyős térkép
  const [drive, setDrive] = useState(false); // „úton haladó” (döntött, menetirány szerint forgó) nézet
  const [rerouting, setRerouting] = useState(false);

  useEffect(() => {
    api("/api/routes").then((all: Route[]) => { const data = visRoutes(all); setRoutes(data); setRoute((r) => r || (data[0]?.id ?? "")); }).catch(() => setMsg("Nem érhető el az adatbázis"));
  }, []);

  const load = useCallback(async (r: string) => {
    const d = await api(`/api/stops?route=${encodeURIComponent(r)}&day=${day}`);
    setStops(d.stops);
    setTick((t) => t + 1);
    setDv(d.deliveries);
    api("/api/meta").then(setMeta).catch(() => {});
  }, [day]);
  useEffect(() => { if (route) load(route); }, [route, load]);

  useEffect(() => {
    if (!showMap) return;
    api(`/api/stops?route=all&day=${day}`).then((d) => {
      setMapStops(visStops(d.stops));
      setDv((o) => ({ ...o, ...d.deliveries }));
    }).catch(() => setMsg("A címek betöltése a térképhez nem sikerült."));
  }, [showMap, day]);

  const handled = (s: Stop) => s.stop_papers.every((p) => dv[p.id]);

  async function cycle(s: Stop, p: Paper) {
    const n = NEXT[dv[p.id] ?? ""];
    setDv((o) => { const c = { ...o }; if (n) c[p.id] = n; else delete c[p.id]; return c; });
    setLast(s);
    await api("/api/deliveries", "PUT", { ids: [p.id], day, status: n });
  }
  async function allDone(s: Stop) {
    const ids = s.stop_papers.filter((p) => !dv[p.id]).map((p) => p.id);
    setDv((o) => ({ ...o, ...Object.fromEntries(ids.map((id) => [id, "delivered"])) }));
    setLast(s);
    if (ids.length) await api("/api/deliveries", "PUT", { ids, day, status: "delivered" });
  }
  // Csak az adott túra címeit térképezi fel (alapból a kiválasztott túra)
  async function geocode(all = false, target = route) {
    try {
      setMsg("Címek keresése a térképadatokban… (első alkalommal akár fél percig is eltarthat)");
      const d = await api(`/api/stops?route=${encodeURIComponent(target)}&day=${day}`);
      const list = (d.stops as Stop[]).filter((s) => all || s.lat == null || s.lon == null);
      if (!list.length) { setMsg("Minden címnek megvan a helye."); return; }
      let res: Record<string, { lat: number; lon: number; kind: string; street?: string } | null>;
      let houses: boolean | undefined;
      try {
        const r = await api("/api/locate", "POST", { addresses: [...new Set(list.map((s) => s.address))] });
        res = r.results; houses = r.houses;
      } catch {
        // Tartalék: ha az OpenStreetMap utcaadat-szerver nem érhető el, címenként keresünk (Nominatim, kb. 1 mp / cím)
        res = {};
        const uniq = [...new Set(list.map((s) => s.address))];
        let i = 0;
        for (const a of uniq) {
          setMsg(`Az utcaadat-szerver most nem érhető el, címenként keresem: ${++i}/${uniq.length} – ${a}`);
          res[a] = await nominatim(a);
          await new Promise((x) => setTimeout(x, 1100));
        }
      }
      // 1. lépés: az utcák alapján elhelyezett címek mentése
      const items = list.flatMap((s) => (res[s.address] ? [{ id: s.id, lat: res[s.address]!.lat, lon: res[s.address]!.lon }] : []));
      if (items.length) await api("/api/stops", "PATCH", { items });
      // 2. lépés: pontosítás – a teljes hivatalos utcanév + házszám keresése (egész cím)
      const house = (a: string) => a.replace(/\(.*?\)/g, "").split("–")[0].trim().match(/\s(\d[\w/-]*)\.?$/)?.[1] ?? null;
      const refine = list.filter((s) => res[s.address] && res[s.address]!.kind !== "pontos" && res[s.address]!.street && house(s.address));
      const seen = new Map<string, { lat: number; lon: number } | null>();
      const upd: { id: string; lat: number; lon: number }[] = [];
      let n = 0;
      for (const s of refine) {
        setMsg(`Pontosítás ${++n}/${refine.length}: ${res[s.address]!.street} ${house(s.address)}`);
        if (!seen.has(s.address)) {
          let hit: { lat: number; lon: number } | null = null;
          try {
            const h = house(s.address)!;
            const j: { lat: string; lon: string; display_name: string; address?: { house_number?: string } }[] = await (await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=5&countrycodes=hu&street=${encodeURIComponent(h + " " + res[s.address]!.street)}&city=Kiskunhalas`)).json();
            const m = j.find((x) => x.display_name.includes("Kiskunhalas") && (x.address?.house_number ?? "").toLowerCase() === h.toLowerCase());
            if (m) hit = { lat: +m.lat, lon: +m.lon };
          } catch {}
          seen.set(s.address, hit);
          await new Promise((x) => setTimeout(x, 1100));
        }
        const hit = seen.get(s.address);
        if (hit) { upd.push({ id: s.id, ...hit }); res[s.address]!.kind = "pontos"; }
      }
      if (upd.length) await api("/api/stops", "PATCH", { items: upd });
      const cnt: Record<string, number> = {};
      list.forEach((s) => { const k = res[s.address]?.kind ?? "nincs"; cnt[k] = (cnt[k] ?? 0) + 1; });
      const miss = [...new Set(list.filter((s) => !res[s.address]).map((s) => s.address))];
      setMsg(`Kész: ${cnt["pontos"] ?? 0} pontos, ${cnt["becsült"] ?? 0} becsült, ${(cnt["utca"] ?? 0) + (cnt["terület"] ?? 0)} utcaszintű, ${miss.length} nem található${miss.length ? ": " + miss.slice(0, 10).join("; ") : ""}.${houses === false ? " A házszám-adatok most nem töltődtek le, ezért a címek utcaszintűek: próbáld újra később az Újraszámolással." : ""}`);
      await load(target);
      const refreshed = await api(`/api/stops?route=all&day=${day}`);
      setMapStops(visStops(refreshed.stops));
      setDv((o) => ({ ...o, ...refreshed.deliveries }));
    } catch (e) { setMsg("A térképadatok lekérése nem sikerült: " + (e instanceof Error ? e.message : String(e))); }
  }
  const mapGeocodeStarted = useRef(false);
  useEffect(() => {
    if (!showMap) { mapGeocodeStarted.current = false; return; }
    if (mapGeocodeStarted.current) return;
    if (!mapStops.length) return;
    mapGeocodeStarted.current = true;
    if (stops.some((s) => s.lat == null || s.lon == null)) mapAndSort();
  // Run once when opening the map, after its all-routes data has loaded.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showMap, mapStops.length]);
  const [dlg, setDlg] = useState<"" | "stop" | "route" | "edit" | "xl">("");
  const [f, setF] = useState({ r: "", a: "", n: "", p: "", o: "", id: "", lat: null as number | null, lon: null as number | null });
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  async function saveStop() {
    if (!f.a.trim() || !f.r) return;
    const ps = f.p.split(",").map((x) => x.trim()).filter(Boolean);
    let { lat, lon } = f;
    if (lat == null) {
      setMsg("Cím ellenőrzése…");
      const v = await verify(f.a);
      setMsg("");
      if (!v && !confirm("Ez a cím nem található Kiskunhalason (vagy nincs internet). Csak kiskunhalasi cím vehető fel. Mentsem pontos hely nélkül?")) return;
      if (v) { lat = v.lat; lon = v.lon; }
    }
    await api("/api/stops", "POST", { route_id: f.r, address: f.a.trim(), name: f.n.trim(), note: f.o.trim(), papers: ps.length ? ps : ["Újság"], lat, lon });
    setDlg(""); setF({ ...f, a: "", n: "", p: "", o: "", lat: null, lon: null });
    if (f.r === route) load(route); else setRoute(f.r);
  }
  const [xd, setXd] = useState(""), [xr, setXr] = useState("all");
  const [editId, setEditId] = useState(""), [editOrig, setEditOrig] = useState("");
  function openEdit(s: Stop) {
    setEditId(s.id); setEditOrig(s.address);
    setF({ ...f, a: s.address, n: s.name, o: s.note, p: s.stop_papers.map((x) => x.paper).join(", "), lat: null, lon: null });
    setDlg("edit");
  }
  async function saveEdit() {
    const a = f.a.trim(); if (!a) return;
    const seen = new Set<string>();
    const ps = f.p.split(",").map((x) => x.trim()).filter((x) => x && !seen.has(x.toLowerCase()) && seen.add(x.toLowerCase()));
    let { lat, lon } = f;
    if (lat == null && a !== editOrig) {
      const v = await verify(a);
      if (!v && !confirm("Ez a cím nem található Kiskunhalason (vagy nincs internet). Csak kiskunhalasi cím vehető fel. Mentsem pontos hely nélkül?")) return;
      if (v) { lat = v.lat; lon = v.lon; }
    }
    await api(`/api/stops?id=${editId}`, "PUT", { address: a, name: f.n.trim(), note: f.o.trim(), papers: ps.length ? ps : ["Újság"], lat, lon });
    setDlg(""); load(route);
  }
  async function delStop() {
    if (!confirm("Biztosan törlöd ezt a címet?")) return;
    await api(`/api/stops?id=${editId}`, "DELETE");
    setDlg(""); load(route);
  }
  async function saveRoute() {
    const id = f.id.trim(); if (!id) return;
    await api("/api/routes", "POST", { id, note: f.o.trim() });
    setRoutes(visRoutes(await api("/api/routes"))); setRoute(id); setDlg(""); setF({ ...f, id: "", o: "" });
  }
  async function sortByProximity(skipGeocode = false) {
    try {
      let source: Stop[] = (await api(`/api/stops?route=${encodeURIComponent(route)}&day=${day}`)).stops;
      if (!skipGeocode && source.some((s) => s.lat == null || s.lon == null)) {
        await geocode(false, route);
        source = (await api(`/api/stops?route=${encodeURIComponent(route)}&day=${day}`)).stops;
      }
      const located = source.filter((s): s is Stop & { lat: number; lon: number } => s.lat != null && s.lon != null);
      const missing = source.filter((s) => s.lat == null || s.lon == null);
      if (!located.length) { setMsg("A közelség szerinti rendezéshez előbb helyadat kell a címekhez."); return; }
      const ordered = bestOrder(located, gps);
      const fullOrder = [...ordered, ...missing];
      await api("/api/stops", "PATCH", { order: fullOrder.map((s) => s.id) });
      await load(route);
      const refreshed = await api(`/api/stops?route=all&day=${day}`);
      setMapStops(visStops(refreshed.stops));
      setDv((o) => ({ ...o, ...refreshed.deliveries }));
      setMsg(`A ${ordered.length} helyadattal rendelkező cím közelség szerint sorba rendezve.${missing.length ? ` ${missing.length} koordináta nélküli cím a lista végére került.` : ""}`);
    } catch (e) {
      setMsg("A címek rendezése nem sikerült: " + (e instanceof Error ? e.message : String(e)));
    }
  }
  // „Címek feltérképezése”: helyek megkeresése, majd közelség szerinti sorrend → ebből készül az útvonal
  const [mapping, setMapping] = useState(false);
  async function mapAndSort() {
    if (mapping) return;
    setMapping(true);
    try { await geocode(false, route); await sortByProximity(true); } finally { setMapping(false); }
  }
  const [scan, setScan] = useState(false);
  async function saveScan(rows: { route_id: string; address: string; name: string; papers: string[]; note?: string }[]) {
    // a még nem létező túrák létrehozása (pl. Excelből érkező új túraszám)
    const fresh = [...new Set(rows.map((r) => r.route_id))].filter((id) => id && !routes.some((x) => x.id === id));
    for (const id of fresh) await api("/api/routes", "POST", { id, note: "" });
    if (fresh.length) setRoutes(visRoutes(await api("/api/routes")));
    const have = new Set(stops.map((s) => s.address.toLowerCase()));
    for (const r of rows) {
      if (!r.route_id) continue;
      if (r.route_id === route && have.has(r.address.toLowerCase())) continue;
      await api("/api/stops", "POST", { note: "", ...r });
    }
    setScan(false); setRoute(rows[0].route_id); await load(rows[0].route_id); geocode(false, rows[0].route_id);
  }
  const pendingNav = useRef<Stop | null>(null);
  const lastReroute = useRef(0);
  // reroute = true: letértünk az útvonalról, az aktuális helyzetből és menetirányból tervezünk újra (mint a Google Maps)
  async function startNav(to: Stop, reroute = false) {
    if (!gps) { pendingNav.current = to; watch(); setMsg("Helyzet meghatározása…"); return; }
    if (to.lat == null || to.lon == null) { setMsg("Ennek a címnek nincs helye a térképen."); return; }
    if (!reroute) setMsg("Útvonal tervezése…");
    setRerouting(reroute);
    lastReroute.current = Date.now();
    const base = `https://router.project-osrm.org/route/v1/driving/${gps.lon},${gps.lat};${to.lon},${to.lat}?overview=full&geometries=geojson&steps=true`;
    // a menetirány megadásával az OSRM olyan útvonalat ad, ami előre indul, és ha kell, a legközelebbi helyen fordít vissza
    const h = heading;
    const urls = h != null ? [`${base}&bearings=${Math.round(h)},60;&radiuses=40;unlimited`, base] : [base];
    try {
      let r = null;
      for (const u of urls) {
        try { const j = await (await fetch(u)).json(); r = j.routes?.[0]; if (r) break; } catch {}
      }
      if (!r) throw new Error();
      const n = makeNav(to, r);
      setNav(n);
      setIdx(reroute && n.steps.length > 1 ? 1 : 0); setMsg("");
      snapFrom.current = 0; offCount.current = 0;
      if (!reroute) { setFull(true); setDrive(true); }
    } catch { if (!reroute) setMsg("Az útvonaltervezés nem sikerült (internet kell)."); }
    finally { setRerouting(false); }
  }
  useEffect(() => {
    const t = q.trim();
    if (!t) { setFound([]); return; }
    const h = setTimeout(async () => {
      try {
        const d = await api(`/api/stops?route=all&day=${day}`);
        const nz = (x: string) => x.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
        const k = nz(t);
        setFound(visStops(d.stops as Stop[]).filter((s) => nz(`${s.address} ${s.name}`).includes(k)));
        setDv((o) => ({ ...o, ...d.deliveries }));
      } catch {}
    }, 300);
    return () => clearTimeout(h);
  }, [q, tick, day]);
  // --- navigáció követése: ráillesztés az útvonalra, következő manőver, letérés esetén újratervezés ---
  const snapFrom = useRef(0), offCount = useRef(0);
  const snap = useMemo(() => (nav && gps ? snapRoute(nav, gps, snapFrom.current) : null), [nav, gps]);
  const tol = Math.max(25, Math.min(gps?.acc ?? 0, 45)); // ennyi méteren belül „az úton vagyunk”
  const onRoute = !!snap && snap.dist <= tol;
  useEffect(() => {
    if (!nav || !gps || !snap) return;
    if (hav(gps, { lat: nav.to.lat!, lon: nav.to.lon! }) < 20 || (onRoute && nav.dist - snap.along < 15)) {
      setNav(null); setDrive(false); setFull(false); setMsg(`Megérkeztél: ${nav.to.address}`);
      if (voice && typeof speechSynthesis !== "undefined") { const u = new SpeechSynthesisUtterance("Megérkeztél"); u.lang = "hu-HU"; speechSynthesis.speak(u); }
      return;
    }
    if (onRoute) {
      offCount.current = 0;
      snapFrom.current = snap.i;
      // a következő, még előttünk lévő manőver
      let i = nav.stepAt.findIndex((a, k) => k >= 1 && a > snap.along + 4);
      if (i < 0) i = nav.steps.length - 1;
      if (i > idx && (idx > 0 || snap.along > 10)) setIdx(i);
    } else if ((gps.acc ?? 0) <= 50) {
      offCount.current++;
      // 3 egymás utáni pont az útvonalon kívül, és legalább 8 mp telt el az előző tervezés óta → újratervezés
      if (offCount.current >= 3 && !rerouting && Date.now() - lastReroute.current > 8000) {
        offCount.current = 0;
        if (voice && typeof speechSynthesis !== "undefined") { const u = new SpeechSynthesisUtterance("Újratervezés"); u.lang = "hu-HU"; speechSynthesis.cancel(); speechSynthesis.speak(u); }
        startNav(nav.to, true);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snap]);
  useEffect(() => { if (gps && pendingNav.current) { const t = pendingNav.current; pendingNav.current = null; startNav(t); } // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gps]);
  // képernyő ébren tartása navigáció közben
  useEffect(() => {
    if (!nav) return;
    let lock: { release: () => Promise<void> } | null = null;
    (navigator as Navigator & { wakeLock?: { request: (t: string) => Promise<{ release: () => Promise<void> }> } }).wakeLock?.request("screen").then((l) => { lock = l; }).catch(() => {});
    return () => { lock?.release().catch(() => {}); };
  }, [!!nav]); // eslint-disable-line react-hooks/exhaustive-deps
  // teljes képernyő: a böngésző saját teljes képernyős módja is (ahol támogatott), és a háttér görgetésének tiltása
  useEffect(() => {
    document.body.style.overflow = full ? "hidden" : "";
    if (full) document.documentElement.requestFullscreen?.().catch(() => {});
    else if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    const onFs = () => { if (!document.fullscreenElement) setFull(false); };
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, [full]);
  useEffect(() => {
    if (!nav || !voice || !nav.steps[idx] || typeof speechSynthesis === "undefined") return;
    const u = new SpeechSynthesisUtterance(stepText(nav.steps[idx])); u.lang = "hu-HU";
    speechSynthesis.cancel(); speechSynthesis.speak(u);
  }, [idx, nav, voice]);
  // --- helymeghatározás és menetirány ---
  const watchId = useRef<number | null>(null);
  const prevFix = useRef<LL | null>(null), lastMove = useRef(0), lastCompass = useRef(0);
  function watch() {
    if (watchId.current != null || !navigator.geolocation) return;
    watchId.current = navigator.geolocation.watchPosition((p) => {
      const c = p.coords, cur = { lat: c.latitude, lon: c.longitude };
      let h: number | null = null;
      // 1) a GPS saját iránya, ha haladunk  2) különben az elmozdulás iránya (legalább 5 m után)
      if (c.heading != null && !isNaN(c.heading) && (c.speed ?? 0) >= 1) h = c.heading;
      const pf = prevFix.current, moved = pf ? hav(pf, cur) : 0;
      if (h == null && pf && moved >= 5 && c.accuracy <= 30) h = bearingOf(pf, cur);
      if (!pf || moved >= 5) prevFix.current = cur;
      if (h != null) { lastMove.current = Date.now(); setHeading(h); }
      setGps({ lat: cur.lat, lon: cur.lon, acc: c.accuracy });
    }, () => { watchId.current = null; alert("A helymeghatározás nincs engedélyezve"); }, { enableHighAccuracy: true, maximumAge: 1000 });
    // 3) álló helyzetben az iránytű (ha a telefon támogatja); iPhone-on engedélyt kell kérni
    const onOri = (e: DeviceOrientationEvent & { webkitCompassHeading?: number }) => {
      const now = Date.now();
      if (now - lastMove.current < 4000 || now - lastCompass.current < 250) return;
      let h: number | null = null;
      if (e.webkitCompassHeading != null) h = e.webkitCompassHeading;
      else if (e.absolute && e.alpha != null) h = 360 - e.alpha;
      if (h == null) return;
      lastCompass.current = now;
      h = (h + (screen.orientation?.angle ?? 0) + 360) % 360;
      setHeading((o) => (o == null || angDiff(o, h!) > 4 ? h : o));
    };
    const DOE = (window as unknown as { DeviceOrientationEvent?: { requestPermission?: () => Promise<string> } }).DeviceOrientationEvent;
    const add = () => {
      window.addEventListener("deviceorientationabsolute", onOri as EventListener, true);
      window.addEventListener("deviceorientation", onOri as EventListener, true);
    };
    if (DOE?.requestPermission) DOE.requestPermission().then((r) => { if (r === "granted") add(); }).catch(() => {});
    else add();
  }

  const here = gps ?? (last?.lat != null ? { lat: last.lat, lon: last.lon! } : null);
  const nx = useMemo(() => {
    let best: Stop | null = null, bd = Infinity;
    for (const s of stops) {
      if (s.lat == null || s.stop_papers.every((p) => dv[p.id])) continue;
      const d = here ? hav(here, { lat: s.lat, lon: s.lon! }) : 0;
      if (d < bd) { bd = d; best = s; }
      if (!here) break;
    }
    return best ? { s: best, d: here ? bd : null } : null;
  }, [stops, dv, here]);

  const pins: Pin[] = mapStops.flatMap((s) => s.lat == null || s.lon == null ? [] : [{
    id: s.id, n: s.position, lat: s.lat, lon: s.lon, label: `${s.address} · ${s.route_id} túra`,
    cls: handled(s) ? "d" : s.stop_papers.some((p) => dv[p.id]) ? "h" : nx?.s.id === s.id ? "n" : "",
  }]);
  useEffect(() => {
    if (!showMap || nav) return;
    const located = stops.filter((s): s is Stop & { lat: number; lon: number } => s.lat != null && s.lon != null);
    setRouteLine(located.map((s) => [s.lat, s.lon]));
    const missing = stops.length - located.length;
    setRouteLineMsg(missing ? `${located.length} / ${stops.length} cím a térképen · ${missing} cím helye hiányzik` : "");
    if (located.length < 2) return;

    const controller = new AbortController();
    const coordinates = located.map((s) => `${s.lon},${s.lat}`).join(";");
    fetch(`https://router.project-osrm.org/route/v1/driving/${coordinates}?overview=full&geometries=geojson&steps=false`, { signal: controller.signal })
      .then((r) => { if (!r.ok) throw new Error("Route request failed"); return r.json(); })
      .then((data) => {
        const coords = data.routes?.[0]?.geometry?.coordinates as [number, number][] | undefined;
        if (!coords?.length) throw new Error("No route geometry");
        setRouteLine(coords.map(([lon, lat]) => [lat, lon]));
      })
      .catch((e) => { if (e.name !== "AbortError") setRouteLineMsg((m) => `${m}${m ? " · " : ""}Az úthálózati útvonal nem érhető el; egyenes szakaszok láthatók.`); });
    return () => controller.abort();
  }, [showMap, route, stops, nav]);
  // a megjelenített helyzet és irány: navigáció közben az útra illesztve (mint a Google Maps-nél)
  const shownHeading = onRoute && snap && (heading == null || angDiff(heading, snap.seg) < 50) ? snap.seg : heading;
  const shownMe = nav && onRoute && snap && gps ? { lat: snap.pt[0], lon: snap.pt[1], acc: gps.acc } : gps;
  const all = stops.flatMap((s) => s.stop_papers);
  const done = all.filter((p) => dv[p.id]).length;

  function summary() {
    const out = stops.flatMap((s) => s.stop_papers.filter((p) => dv[p.id] && dv[p.id] !== "delivered").map((p) => `${s.address} – ${p.paper}: ${LABEL[dv[p.id]]}`));
    setSum(`Összesítő – ${day} – ${route}\n\n` + (out.join("\n") || "Nincs hiányzó vagy lemondott újság."));
  }

  const note = routes.find((r) => r.id === route)?.note;
  const renderCard = (s: Stop, i: number, tag?: string) => {
    const d = handled(s);
    if (only && d && !tag) return null;
    return (
      <div key={s.id} id={"c" + s.id} className={`card${d ? " done" : ""}${nx?.s.id === s.id && showMap && !tag ? " nx" : ""}`}>
        <div className="top">
          <div><div className="ad">{i >= 0 ? `${i + 1}. ` : ""}{s.address}</div>{(s.name || tag) && <div className="nm">{s.name}{tag && ` · ${tag}. túra`}</div>}</div>
          <div style={{ display: "flex", gap: 4, height: "fit-content" }}>
            <button className="all" style={{ color: "var(--mu)", borderColor: "var(--bd)" }} onClick={() => openEdit(s)}>✎ Szerkeszt</button>
            {!d && <button className="all" onClick={() => allDone(s)}>Mind leadva</button>}
          </div>
        </div>
        {s.note && <div className="sn">⚠ {s.note}</div>}
        <div className="chips">
          {s.stop_papers.map((p) => (
            <button key={p.id} className={`chip ${dv[p.id] ?? ""}`} onClick={() => cycle(s, p)}>
              {p.paper}{dv[p.id] ? " · " + LABEL[dv[p.id]] : ""}
            </button>
          ))}
        </div>
      </div>
    );
  };

  return (
    <>
      <header>
        <div className="tabs">{routes.map((r) => <button key={r.id} className={r.id === route ? "on" : ""} onClick={() => setRoute(r.id)}>{r.name}</button>)}</div>
        <div className="bar"><i style={{ width: `${all.length ? (done / all.length) * 100 : 0}%` }} /></div>
        <div className="meta">{done} / {all.length} újság kezelve · {day}</div>
        <div className="tools">
          <button onClick={() => setOnly(!only)}>{only ? "Mind mutat" : "Csak hátralévők"}</button>
          <button onClick={summary}>Összesítő</button>
          <button className={showMap ? "on" : ""} onClick={() => setShowMap(!showMap)}>Térkép</button>
          <button onClick={() => sortByProximity()} disabled={!stops.length}>Közelség szerinti sorrend</button>
          <button onClick={() => { setF({ ...f, r: route }); setDlg("stop"); }}>+ Cím</button>
          <button onClick={() => setDlg("route")}>+ Túra</button>
          <button onClick={() => setScan(true)}>📷 Beolvasás</button>
          <button onClick={() => { setXd(day); setXr("all"); setDlg("xl"); }}>📊 Excel</button>
        </div>
      </header>
      <main>
        <input className="srch" placeholder="🔎 Keresés: utca, házszám vagy név (minden túrában)" value={q} onChange={(e) => setQ(e.target.value)} />
        {showMap && (
          <>
            <div className={`mapwrap${full ? " full" : ""}`}>
              <MapView pins={pins} me={shownMe} heading={shownHeading} line={nav?.coords ?? routeLine} cut={nav && onRoute && snap ? { i: snap.i, pt: snap.pt } : null}
                follow={!!nav} drive={drive} full={full} onPick={(id) => {
                const selected = mapStops.find((s) => s.id === id);
                if (!selected) return;
                if (selected.route_id && selected.route_id !== route) setRoute(selected.route_id);
                if (full) { setFull(false); setDrive(false); }
                window.setTimeout(() => document.getElementById("c" + id)?.scrollIntoView({ behavior: "smooth", block: "center" }), 150);
              }} />
              <div className="mapctl">
                <button title={full ? "Kicsinyítés" : "Teljes képernyő"} onClick={() => setFull(!full)}>{full ? "✕" : "⛶"}</button>
                <button title="Vezetés nézet (menetirány szerint, döntve)" className={drive ? "on" : ""} onClick={() => { if (!drive) watch(); setDrive(!drive); }}>{drive ? "2D" : "3D"}</button>
                {!gps && <button title="Saját helyzet" onClick={watch}>⌖</button>}
              </div>
              {nav && (() => {
                const st = nav.steps[idx], [lo, la] = st.maneuver.location;
                const tgt = idx === 0 && nav.steps.length > 1 ? 1 : idx;
                const d = gps ? (onRoute && snap ? nav.stepAt[tgt] - snap.along : hav(gps, { lat: la, lon: lo })) : null;
                const rem = onRoute && snap ? Math.max(0, nav.dist - snap.along) : nav.dist;
                const remT = nav.dist ? (nav.dur * rem) / nav.dist : nav.dur;
                const eta = new Date(Date.now() + remT * 1000).toLocaleTimeString("hu-HU", { hour: "2-digit", minute: "2-digit" });
                const nxt = nav.steps[idx + 1];
                return (<>
                  <div className="navtop">
                    <div className="navic">{stepIcon(st)}</div>
                    <div style={{ minWidth: 0 }}>
                      {d != null && <div className="navd">{fmtDist(d)}</div>}
                      <div className="navt">{rerouting ? "Újratervezés…" : stepText(st)}</div>
                      {nxt && idx > 0 && <div className="navn">Utána: {stepIcon(nxt)} {stepText(nxt)}</div>}
                    </div>
                  </div>
                  <div className="navbot">
                    <div><b>{Math.max(1, Math.round(remT / 60))} perc</b> · {fmtDist(rem)} · érkezés {eta}</div>
                    <div className="nm" style={{ color: "inherit", opacity: .8 }}>Cél: {nav.to.address}{!onRoute && gps ? " · letértél az útvonalról" : ""}</div>
                    <div className="mt" style={{ marginTop: 6 }}>
                      <button onClick={() => startNav(nav.to, true)}>Újratervezés</button>
                      <button className={voice ? "on" : ""} onClick={() => setVoice(!voice)}>🔊 Hang</button>
                      <button onClick={() => { setNav(null); setDrive(false); setFull(false); }}>Leállítás</button>
                    </div>
                  </div>
                </>);
              })()}
            </div>
            <div className="meta" style={{ marginTop: 6 }}>{pins.length} / {mapStops.length} cím helye látható a térképen{pins.length < mapStops.length ? ` · ${mapStops.length - pins.length} hely keresése folyamatban vagy sikertelen` : " · minden túra"}</div>
            {routeLineMsg && <div className="meta" style={{ marginTop: 6 }}>{routeLineMsg}</div>}
            <div className="mt" style={{ margin: "8px 0" }}><button disabled={mapping} onClick={mapAndSort}>{mapping ? "Feltérképezés…" : "Címek feltérképezése"}</button><button disabled={mapping} onClick={async () => { if (!confirm("A túra minden címének helyét újraszámolja, a kézzel javítottakat is. Folytatod?")) return; setMapping(true); try { await geocode(true, route); await sortByProximity(true); } finally { setMapping(false); } }}>Újraszámolás</button><button onClick={watch}>Saját helyzet</button></div>
            {msg && <div className="meta">{msg}</div>}
            {nx && !nav && <div className="nxb">Legközelebbi: <b>{nx.s.address}</b>{nx.d != null && ` (${Math.round(nx.d)} m)`} · <button className="all" style={{ color: "#fff", borderColor: "#fff" }} onClick={() => startNav(nx.s)}>Navigálás</button></div>}
          </>
        )}
        {sum && <pre>{sum}<br /><button onClick={() => navigator.clipboard.writeText(sum)}>Másolás</button> <button onClick={() => setSum("")}>Bezár</button></pre>}
        {note && <div className="note">{note}</div>}
        {q.trim() ? (
          <>
            <div className="meta" style={{ margin: "6px 0" }}>{found.length} találat (minden túrában)</div>
            {found.map((s) => renderCard(s, -1, s.route_id))}
          </>
        ) : stops.map((s, i) => renderCard(s, i))}
      </main>
      {dlg && (
        <div className="ov" onClick={() => setDlg("")}>
          <div className="dlg" onClick={(e) => e.stopPropagation()}>
            {dlg === "xl" ? (<>
              <b>Excel letöltése</b>
              <input type="date" value={xd} onChange={(e) => setXd(e.target.value)} />
              <select value={xr} onChange={(e) => setXr(e.target.value)}>
                <option value="all">Minden túra</option>
                {routes.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
              <small>Lapok: Összesítő (újságonként), Kiküldött, Hiányzik, Lemondva, Nem kezelt.</small>
              <div className="row">
                <button onClick={() => setDlg("")}>Bezár</button>
                <a href={`/api/export?day=${xd}&route=${encodeURIComponent(xr)}`} style={{ flex: 1, padding: 10, borderRadius: 8, textAlign: "center", textDecoration: "none", background: "var(--ac)", color: "#fff" }}>⬇ Letöltés</a>
              </div>
            </>) : dlg === "edit" ? (<>
              <b>Cím szerkesztése</b>
              <StopForm f={f} setF={setF} meta={meta} />
              <div className="row"><button onClick={delStop} style={{ color: "var(--ca)" }}>Cím törlése</button><button onClick={() => setDlg("")}>Mégse</button><button className="p" onClick={saveEdit}>Mentés</button></div>
            </>) : dlg === "stop" ? (<>
              <b>Új cím felvétele</b>
              <select value={f.r} onChange={set("r")}>{routes.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select>
              <StopForm f={f} setF={setF} meta={meta} />
              <div className="row"><button onClick={() => setDlg("")}>Mégse</button><button className="p" onClick={saveStop}>Mentés</button></div>
            </>) : (<>
              <b>Új túra felvétele</b>
              <input placeholder="Túra száma (pl. 255)" value={f.id} onChange={set("id")} />
              <input placeholder="Megjegyzés (nem kötelező)" value={f.o} onChange={set("o")} />
              <div className="row"><button onClick={() => setDlg("")}>Mégse</button><button className="p" onClick={saveRoute}>Mentés</button></div>
            </>)}
          </div>
        </div>
      )}
      {scan && <Scan routes={routes} route={route} onSave={saveScan} onClose={() => setScan(false)} />}
    </>
  );
}

