"use client";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Pin } from "@/components/Map";
import Scan from "@/components/Scan";
import StopForm, { type Meta } from "@/components/StopForm";
import { HIDDEN_ROUTES } from "@/lib/hidden";
import { splitPapers } from "@/lib/papers";

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
  // A kiválasztott nap: alapból a mai. Korábbi napra váltva az aznapi jelölések látszanak és szerkeszthetők.
  const today = new Date().toLocaleDateString("sv-SE");
  const [day, setDay] = useState(today);
  const dayRef = useRef(day); dayRef.current = day;
  const shiftDay = (n: number) => {
    const d = new Date(day + "T12:00:00"); d.setDate(d.getDate() + n);
    const x = d.toLocaleDateString("sv-SE");
    if (x <= today) setDay(x);
  };
  useEffect(() => { setDv({}); setSince({}); }, [day]); // napváltáskor az előző nap jelölései ne keveredjenek bele
  const [routes, setRoutes] = useState<Route[]>([]);
  const [route, setRoute] = useState("");
  const [stops, setStops] = useState<Stop[]>([]);
  const [mapStops, setMapStops] = useState<Stop[]>([]);
  const [dv, setDv] = useState<Record<string, string>>({});
  // örökölt lemondások: újság → melyik naptól van lemondva (korábbi napon állították be)
  const [since, setSince] = useState<Record<string, string>>({});
  const sinceTxt = (id: string) => since[id] && dv[id] === "cancelled" ? ` (${since[id].slice(5).replace("-", ".")}. óta)` : "";
  // szűrés állapot szerint: "" = mind, todo = hátralévő, vagy egy jelölés
  const [flt, setFlt] = useState<"" | "todo" | "delivered" | "missing" | "cancelled">("");
  const [showMap, setShowMap] = useState(false);
  const [gps, setGps] = useState<{ lat: number; lon: number; acc?: number } | null>(null);
  const [last, setLast] = useState<Stop | null>(null);
  const [msg, setMsg] = useState("");
  const [toast, setToast] = useState("");
  const toastT = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const showToast = (t: string) => { setToast(t); clearTimeout(toastT.current); toastT.current = setTimeout(() => setToast(""), 3500); };
  const [sum, setSum] = useState("");
  const [meta, setMeta] = useState<Meta>({ papers: [], addresses: [], names: [] });
  const [q, setQ] = useState("");
  const [found, setFound] = useState<Stop[]>([]);
  const [tick, setTick] = useState(0);
  const [nav, setNav] = useState<Nav | null>(null);
  const [routeLine, setRouteLine] = useState<[number, number][] | null>(null);
  const [routeLineMsg, setRouteLineMsg] = useState("");
  const [restOnly, setRestOnly] = useState(false);
  const [picked, setPicked] = useState("");
  const [pickNote, setPickNote] = useState("");
  const [infoId, setInfoId] = useState("");
  const [pickTick, setPickTick] = useState(0);   // ugyanarra a címre újra rábökve is görgessen      // a térképen egyszer rábökött cím (kis ablak) // a kiemelt kártya fejléce (honnan jött a kiválasztás)          // a térképen rábökött cím (kiemelve a listában)
  const pickScrolled = useRef(false);
  // a listában rábökött cím megmutatása a térképen
  const [focus, setFocus] = useState<{ lat: number; lon: number; label: string; k: number } | null>(null);
  function showOnMap(s: Stop) {
    setPicked(s.id); setPickNote("🗺️ A térképen mutatott cím"); pickScrolled.current = true; // a kártya is kiemelve marad, de nem görgetünk le hozzá
    if (s.lat == null || s.lon == null) { setFocus(null); setMsg(`„${s.address}” helye még nincs meg a térképen (Címek feltérképezése).`); }
    else setFocus({ lat: s.lat, lon: s.lon, label: `${s.address}${s.name ? " – " + s.name : ""}`, k: Date.now() });
    setShowMap(true);
    // fel a térképhez (a ragadós fejléc alá)
    setTimeout(() => {
      const el = document.querySelector(".mapwrap") as HTMLElement | null;
      const head = (document.querySelector("header") as HTMLElement | null)?.offsetHeight ?? 0;
      if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - head - 8, behavior: "smooth" });
      else window.scrollTo({ top: 0, behavior: "smooth" });
    }, 60);
  }
  // „fel” gomb: csak akkor látszik, ha már lejjebb görgettünk
  const [showTop, setShowTop] = useState(false);
  useEffect(() => {
    const on = () => setShowTop(window.scrollY > 300);
    on(); window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);           // csak a hátralévő címek útvonala
  const [restOrder, setRestOrder] = useState<string[]>([]);  // a hátralévő címek újraszámolt sorrendje
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
    if (dayRef.current !== day) return; // időközben másik napra váltottunk
    setStops(d.stops);
    setTick((t) => t + 1);
    // csak ennek a túrának az újságjait frissítjük (a térkép a többi túra jelöléseit is tartja)
    setDv((o) => {
      const c = { ...o };
      for (const s of d.stops as Stop[]) for (const p of s.stop_papers) delete c[p.id];
      return { ...c, ...d.deliveries };
    });
    setSince((o) => {
      const c = { ...o };
      for (const s of d.stops as Stop[]) for (const p of s.stop_papers) delete c[p.id];
      return { ...c, ...(d.since ?? {}) };
    });
    api("/api/meta").then(setMeta).catch(() => {});
  }, [day]);
  useEffect(() => { if (route) load(route); }, [route, load]);

  useEffect(() => {
    if (!showMap) return;
    api(`/api/stops?route=all&day=${day}`).then((d) => {
      if (dayRef.current !== day) return;
      setMapStops(visStops(d.stops));
      setDv((o) => ({ ...o, ...d.deliveries }));
      setSince((o) => ({ ...o, ...(d.since ?? {}) }));
    }).catch(() => setMsg("A címek betöltése a térképhez nem sikerült."));
  }, [showMap, day]);

  const handled = (s: Stop) => s.stop_papers.every((p) => dv[p.id]);
  // van még leadandó újsága (jelöletlen vagy „Hiányzik”)
  // még nincs elintézve: van jelöletlen újsága (a Leadva, Hiányzik és Lemondva is elintézettnek számít)
  const pending = (s: Stop) => s.stop_papers.some((p) => !dv[p.id]);
  const navOn = useRef(false);
  // A lista sorrendje (a „Hátralévő útvonal” módban az újraszámolt sorrend), és benne a következő elintézetlen cím
  function nextAfter(id: string | null, d: Record<string, string>): Stop | null {
    const order = restOnly && restOrder.length
      ? [...restOrder.map((x) => stops.find((s) => s.id === x)).filter(Boolean) as Stop[], ...stops.filter((s) => !restOrder.includes(s.id))]
      : stops;
    const n = order.length, i = id ? order.findIndex((s) => s.id === id) : -1;
    for (let k = 1; k <= n; k++) {
      const s = order[(i + k + n) % n];
      if (s.id !== id && s.lat != null && s.lon != null && s.stop_papers.some((p) => !d[p.id])) return s;
    }
    return null;
  }
  // Jelölés után: ha a cím minden újsága jelölve van (Leadva / Hiányzik / Lemondva), navigáció közben
  // pár másodperc múlva indul a következő címre (közben még át lehet jelölni, vagy le lehet állítani).
  const [advance, setAdvance] = useState<{ from: Stop; to: Stop | null; at: number } | null>(null);
  function afterMark(s: Stop, d: Record<string, string>) {
    const done = s.stop_papers.every((p) => d[p.id]);
    const isTarget = nav?.to.id === s.id || advance?.from.id === s.id || last?.id === s.id || nearDone.current === s.id;
    if (!done) { if (advance?.from.id === s.id) setAdvance(null); return; }
    if (!navOn.current || !isTarget && nav) return;
    setAdvance({ from: s, to: nextAfter(s.id, d), at: Date.now() + 4000 });
  }
  const [, setTickNow] = useState(0);
  useEffect(() => {
    if (!advance) return;
    const t = setInterval(() => {
      setTickNow((x) => x + 1);
      if (Date.now() >= advance.at) {
        clearInterval(t);
        const to = advance.to;
        setAdvance(null);
        if (to) { setPicked(to.id); setPickNote("➡️ Következő cím"); startNav(to); }
        else { navOn.current = false; setNav(null); setFull(false); setDrive(false); setMsg("🎉 Minden cím elintézve!"); }
      }
    }, 250);
    return () => clearInterval(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [advance]);

  async function cycle(s: Stop, p: Paper) {
    const n = NEXT[dv[p.id] ?? ""];
    const nd = { ...dv }; if (n) nd[p.id] = n; else delete nd[p.id];
    setSince((o) => { if (!o[p.id]) return o; const c = { ...o }; delete c[p.id]; return c; }); // mától saját jelölés
    if (n === "cancelled") showToast(`🚫 ${p.paper} – ${s.address}: lemondva mától, amíg át nem állítod.`);
    else if (dv[p.id] === "cancelled") showToast(`✔ ${p.paper} – ${s.address}: a lemondás mától megszűnt.`);
    setDv((o) => { const c = { ...o }; if (n) c[p.id] = n; else delete c[p.id]; return c; });
    setLast(s);
    afterMark(s, nd);
    await api("/api/deliveries", "PUT", { ids: [p.id], day, status: n });
  }
  async function allDone(s: Stop) {
    const ids = s.stop_papers.filter((p) => !dv[p.id]).map((p) => p.id);
    setDv((o) => ({ ...o, ...Object.fromEntries(ids.map((id) => [id, "delivered"])) }));
    setLast(s);
    afterMark(s, { ...dv, ...Object.fromEntries(ids.map((id) => [id, "delivered"])) });
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
    const ps = splitPapers(f.p);
    let { lat, lon } = f;
    if (lat == null && !dupe) {
      setMsg("Cím ellenőrzése…");
      const v = await verify(f.a);
      setMsg("");
      if (!v && !confirm("Ez a cím nem található Kiskunhalason (vagy nincs internet). Csak kiskunhalasi cím vehető fel. Mentsem pontos hely nélkül?")) return;
      if (v) { lat = v.lat; lon = v.lon; }
    }
    const r = await fetch("/api/stops", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ route_id: f.r, address: f.a.trim(), name: f.n.trim(), note: f.o.trim(), papers: ps.length ? ps : ["Újság"], lat, lon, merge: !!dupe }) });
    const j = await r.json().catch(() => ({}));
    if (r.status === 409) { setDupe(j.match); return; } // közben derült ki, hogy már megvan: figyelmeztetés a párbeszédben
    if (!r.ok) { alert(j.error ?? "A mentés nem sikerült."); return; }
    setDlg(""); setF({ ...f, a: "", n: "", p: "", o: "", lat: null, lon: null }); setDupe(null);
    const target = j.merged ? j.match.route_id : f.r;
    if (j.merged) setMsg(j.added?.length ? `${j.match.address}: hozzáadva ${j.added.join(", ")}` : `${j.match.address}: ezek az újságok már rajta voltak.`);
    if (target === route) load(route); else setRoute(target);
  }
  // Dupla cím figyelése: a beírt cím szerepel-e már (bármelyik túrában)
  type Match = { id: string; route_id: string; address: string; name: string; papers: string[] };
  const [dupe, setDupe] = useState<Match | null>(null);
  useEffect(() => {
    setDupe(null);
    if (dlg !== "stop" && dlg !== "edit") return;
    const a = f.a.trim();
    if (a.length < 4) return;
    const t = setTimeout(async () => {
      try {
        const j = await api(`/api/check-address?address=${encodeURIComponent(a)}${dlg === "edit" ? `&except=${editId}` : ""}`);
        setDupe(j.match);
      } catch {}
    }, 400);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [f.a, dlg]);
  const [xd, setXd] = useState(""), [xt, setXt] = useState(""), [xr, setXr] = useState("all"); // Excel: ettől–eddig, túra
  const [editId, setEditId] = useState(""), [editOrig, setEditOrig] = useState("");
  function openEdit(s: Stop) {
    setEditId(s.id); setEditOrig(s.address);
    setF({ ...f, a: s.address, n: s.name, o: s.note, p: s.stop_papers.map((x) => x.paper).join(", "), lat: null, lon: null });
    setDlg("edit");
  }
  async function saveEdit() {
    const a = f.a.trim(); if (!a) return;
    const ps = splitPapers(f.p);
    let { lat, lon } = f;
    if (lat == null && a !== editOrig) {
      const v = await verify(a);
      if (!v && !confirm("Ez a cím nem található Kiskunhalason (vagy nincs internet). Csak kiskunhalasi cím vehető fel. Mentsem pontos hely nélkül?")) return;
      if (v) { lat = v.lat; lon = v.lon; }
    }
    if (dupe) return; // ütköző cím: a párbeszéd már jelzi
    const r = await fetch(`/api/stops?id=${editId}`, { method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address: a, name: f.n.trim(), note: f.o.trim(), papers: ps.length ? ps : ["Újság"], lat, lon }) });
    if (r.status === 409) { setDupe((await r.json()).match); return; }
    if (!r.ok) { alert("A mentés nem sikerült."); return; }
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
    // a már meglévő címeknél nem lesz új cím, csak az új újságok kerülnek hozzá (a szerver dönti el)
    let merged = 0;
    for (const r of rows) {
      if (!r.route_id) continue;
      const j = await api("/api/stops", "POST", { note: "", ...r, merge: true });
      if (j.merged) merged++;
    }
    if (merged) setMsg(`${merged} cím már szerepelt – ezeknél csak az új újságok kerültek hozzá.`);
    setScan(false); setRoute(rows[0].route_id); await load(rows[0].route_id); geocode(false, rows[0].route_id);
  }
  const pendingNav = useRef<Stop | null>(null);
  const lastReroute = useRef(0);
  // reroute = true: letértünk az útvonalról, az aktuális helyzetből és menetirányból tervezünk újra (mint a Google Maps)
  async function startNav(to: Stop, reroute = false) {
    if (!reroute) navOn.current = true; // navigációs „menet” fut: a cím elintézése után jön a következő
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
  // a cél címének újságjai, az aktuális jelölésekkel (a listából vagy a térkép adataiból)
  const navStop = nav ? (stops.find((s) => s.id === nav.to.id) ?? mapStops.find((s) => s.id === nav.to.id) ?? nav.to) : null;
  const navPapers = navStop ? navStop.stop_papers.map((p) => ({ p, st: dv[p.id] as string | undefined })) : [];
  // A cél közelében: a térkép kicsire vált, és a lista a cél címére görget (kiemelve), hogy lásd, mit kell leadni.
  const nearDone = useRef("");
  const showTarget = (s: Stop) => {
    setFull(false); setDrive(false); setFlt(""); setQ("");
    setPicked(s.id); setPickNote("🎯 A célhoz értél – ezeket kell leadni"); pickScrolled.current = false; setPickTick((t) => t + 1);
  };
  useEffect(() => {
    if (!nav || !gps || !snap) return;
    const straight = hav(gps, { lat: nav.to.lat!, lon: nav.to.lon! });
    const left = onRoute ? nav.dist - snap.along : straight;
    if (nearDone.current !== nav.to.id && (straight < 50 || left < 60)) {
      nearDone.current = nav.to.id;
      showTarget(nav.to);
      if (voice && typeof speechSynthesis !== "undefined") {
        const ps = navPapers.filter((x) => !x.st).map((x) => x.p.paper).join(", ");
        const u = new SpeechSynthesisUtterance(`Közel vagy: ${nav.to.address}.${ps ? " Leadandó: " + ps : ""}`); u.lang = "hu-HU"; speechSynthesis.cancel(); speechSynthesis.speak(u);
      }
    }
    if (straight < 20 || (onRoute && nav.dist - snap.along < 15)) {
      if (nearDone.current !== nav.to.id) { nearDone.current = nav.to.id; showTarget(nav.to); }
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
      if (now - lastMove.current < 4000 || now - lastCompass.current < 400) return;
      let h: number | null = null;
      if (e.webkitCompassHeading != null) h = e.webkitCompassHeading;
      else if (e.absolute && e.alpha != null) h = 360 - e.alpha;
      if (h == null) return;
      lastCompass.current = now;
      h = (h + (screen.orientation?.angle ?? 0) + 360) % 360;
      setHeading((o) => (o == null || angDiff(o, h!) > 5 ? h : o));
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
  // A következő cím a lista sorrendjében (a legutóbb elintézett után), nem a legközelebbi
  const nx = useMemo(() => {
    const best = nextAfter(last?.id ?? null, dv);
    return best ? { s: best, d: here ? hav(here, { lat: best.lat!, lon: best.lon! }) : null } : null;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stops, dv, here, last, restOnly, restOrder]);

  const infoStop = infoId ? (stops.find((s) => s.id === infoId) ?? mapStops.find((s) => s.id === infoId) ?? null) : null;
  const restN = new Map(restOrder.map((id, i) => [id, i + 1]));
  // „Hátralévő útvonal” módban (vagy a „Hátralévő” szűrőnél) a már elintézett címek nem látszanak a térképen
  const hideDone = restOnly || flt === "todo";
  const pins: Pin[] = mapStops.flatMap((s) => s.lat == null || s.lon == null || (hideDone && !pending(s) && s.id !== picked) ? [] : [{
    id: s.id, n: restN.get(s.id) ?? s.position,
    // hátralévő módban a már kész címek pipát kapnak, hogy ne keveredjenek az új sorszámokkal
    t: restOnly && s.route_id === route && !restN.has(s.id) ? "✓" : undefined, lat: s.lat, lon: s.lon, label: `${s.address} · ${s.route_id} túra`,
    cls: restN.has(s.id)
      ? (restN.get(s.id) === 1 ? "n" : s.stop_papers.some((p) => dv[p.id]) ? "h" : "") // hátralévő: az első narancs
      : handled(s) ? "d" : s.stop_papers.some((p) => dv[p.id]) ? "h" : nx?.s.id === s.id ? "n" : "",
  }]);
  // „Hátralévő útvonal” mód: csak azok a címek, ahol van még le nem adott újság (jelöletlen vagy „Hiányzik”),
  // a sorrendet a jelenlegi helyzetből újraszámolja; a leadott / lemondott címek kimaradnak az útvonalból.
  const restKey = restOnly ? stops.filter(pending).map((s) => s.id).join(",") : "";
  const gpsRef = useRef(gps); gpsRef.current = gps;
  useEffect(() => {
    if (!showMap || nav) return;
    const located = stops.filter((s): s is Stop & { lat: number; lon: number } => s.lat != null && s.lon != null);
    const missing = stops.length - located.length;
    let pts: { lat: number; lon: number }[] = located;
    const here = gpsRef.current;
    if (restOnly) {
      const rest = bestOrder(located.filter(pending), here);
      setRestOrder(rest.map((s) => s.id));
      pts = here && rest.length ? [here, ...rest] : rest;
      setRouteLineMsg(rest.length
        ? `Hátralévő útvonal: ${rest.length} cím${here ? " a jelenlegi helyzetedtől" : ""} (újraszámolva)`
        : "Minden cím le van adva – nincs hátralévő útvonal.");
    } else {
      setRestOrder([]);
      setRouteLineMsg(missing ? `${located.length} / ${stops.length} cím a térképen · ${missing} cím helye hiányzik` : "");
    }
    setRouteLine(pts.length ? pts.map((s) => [s.lat, s.lon]) : null);
    if (pts.length < 2) return;

    const controller = new AbortController();
    // jelöléskor ne kérjünk azonnal új útvonalat minden koppintásra
    const t = setTimeout(() => {
      const coordinates = pts.map((s) => `${s.lon},${s.lat}`).join(";");
      fetch(`https://router.project-osrm.org/route/v1/driving/${coordinates}?overview=full&geometries=geojson&steps=false`, { signal: controller.signal })
        .then((r) => { if (!r.ok) throw new Error("Route request failed"); return r.json(); })
        .then((data) => {
          const r0 = data.routes?.[0];
          const coords = r0?.geometry?.coordinates as [number, number][] | undefined;
          if (!coords?.length) throw new Error("No route geometry");
          setRouteLine(coords.map(([lon, lat]) => [lat, lon]));
          if (restOnly) setRouteLineMsg((m) => `${m} · ${(r0.distance / 1000).toFixed(1)} km, kb. ${Math.round(r0.duration / 60)} perc`);
        })
        .catch((e) => { if (e.name !== "AbortError") setRouteLineMsg((m) => `${m}${m ? " · " : ""}Az úthálózati útvonal nem érhető el; egyenes szakaszok láthatók.`); });
    }, restOnly ? 600 : 0);
    return () => { clearTimeout(t); controller.abort(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showMap, route, stops, nav, restOnly, restKey]);
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
  // a térképen kiválasztott cím kártyájához görgetünk, amint megjelenik (túraváltáskor a betöltés után)
  useEffect(() => {
    if (!picked || pickScrolled.current) return;
    let n = 0;
    const t = setInterval(() => {
      const el = document.getElementById("c" + picked);
      if (el) { el.scrollIntoView({ behavior: "smooth", block: "center" }); pickScrolled.current = true; clearInterval(t); }
      else if (++n > 30) clearInterval(t);
    }, 100);
    return () => clearInterval(t);
  }, [picked, stops, pickTick]);
  const renderCard = (s: Stop, i: number, tag?: string) => {
    const d = handled(s);
    if (flt && !tag && !s.stop_papers.some((p) => (flt === "todo" ? !dv[p.id] : dv[p.id] === flt))) return null;
    return (
      <div key={s.id} id={"c" + s.id} onClick={(e) => { if (!(e.target as HTMLElement).closest("button, a, input, select")) showOnMap(s); }} className={`card${d ? " done" : ""}${nx?.s.id === s.id && showMap && !tag ? " nx" : ""}${picked === s.id ? " sel" : ""}`}>
        {picked === s.id && <div className="selhd"><span>{pickNote || "📍 A térképen kiválasztott cím"}</span><button onClick={() => { setPicked(""); setFocus(null); }} aria-label="Kijelölés megszüntetése">✕</button></div>}
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
              {p.paper}{dv[p.id] ? " · " + LABEL[dv[p.id]] + sinceTxt(p.id) : ""}
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
        <div className="meta">{done} / {all.length} újság kezelve</div>
        <div className="day">
          <button onClick={() => shiftDay(-1)} aria-label="Előző nap">◀</button>
          <input type="date" value={day} max={today} onChange={(e) => e.target.value && setDay(e.target.value > today ? today : e.target.value)} />
          <button onClick={() => shiftDay(1)} disabled={day >= today} aria-label="Következő nap">▶</button>
          {day !== today && <button className="on" onClick={() => setDay(today)}>Ma</button>}
        </div>
        {day !== today && <div className="past">📅 {new Date(day + "T12:00:00").toLocaleDateString("hu-HU", { year: "numeric", month: "long", day: "numeric", weekday: "long" })} – a jelölések erre a napra kerülnek</div>}
        <div className="tools">
          <button onClick={summary}>Összesítő</button>
          <button className={showMap ? "on" : ""} onClick={() => setShowMap(!showMap)}>Térkép</button>
          <button onClick={() => sortByProximity()} disabled={!stops.length}>Közelség szerinti sorrend</button>
          <button onClick={() => { setF({ ...f, r: route }); setDlg("stop"); }}>+ Cím</button>
          <button onClick={() => setDlg("route")}>+ Túra</button>
          <button onClick={() => setScan(true)}>📷 Beolvasás</button>
          <button onClick={() => { setXd(day); setXt(day); setXr("all"); setDlg("xl"); }}>📊 Excel</button>
        </div>
      </header>
      <main>
        <input className="srch" placeholder="🔎 Keresés: utca, házszám vagy név (minden túrában)" value={q} onChange={(e) => setQ(e.target.value)} />
        {!q.trim() && (() => {
          const c = { todo: 0, delivered: 0, missing: 0, cancelled: 0 } as Record<string, number>;
          all.forEach((p) => { c[dv[p.id] ?? "todo"]++; });
          const B = (k: typeof flt, t: string, n?: number) => (
            <button className={`f-${k || "all"}${flt === k ? " on" : ""}`} onClick={() => setFlt(flt === k ? "" : k)}>{t}{n != null && <b> {n}</b>}</button>);
          return <div className="flt">{B("", "Mind", all.length)}{B("todo", "Hátralévő", c.todo)}{B("delivered", "Leadva", c.delivered)}{B("missing", "Hiányzik", c.missing)}{B("cancelled", "Lemondva", c.cancelled)}</div>;
        })()}
        {showMap && (
          <>
            <div className={`mapwrap${full ? " full" : ""}${nav ? "" : " nonav"}`}>
              <MapView focus={focus} pins={pins} me={shownMe} heading={shownHeading} line={nav?.coords ?? routeLine} cut={nav && onRoute && snap ? { i: snap.i, pt: snap.pt } : null}
                follow={!!nav} drive={drive} full={full} info={infoStop ? {
                  id: infoStop.id, lat: infoStop.lat!, lon: infoStop.lon!, title: infoStop.address,
                  sub: [infoStop.name, infoStop.route_id && `${infoStop.route_id}. túra`].filter(Boolean).join(" · "),
                  note: infoStop.note, papers: infoStop.stop_papers.map((p) => ({ name: p.paper, st: dv[p.id] })),
                } : null} onInfoClose={() => setInfoId("")} onPick={(id) => {
                const selected = mapStops.find((s) => s.id === id);
                if (!selected) return;
                // első koppintás: kis ablak a címmel és az újságokkal; második (ugyanarra): ugrás a listában a címhez
                if (infoId !== id) { setInfoId(id); return; }
                setInfoId("");
                if (selected.route_id && selected.route_id !== route) setRoute(selected.route_id);
                if (full) { setFull(false); setDrive(false); }
                // a szűrő vagy a keresés ne rejtse el a kiválasztott címet (pl. leadott cím a „Hátralévő” szűrőnél)
                setFlt(""); setQ("");
                setPicked(id); setPickNote(""); pickScrolled.current = false; setFocus(null); setPickTick((t) => t + 1);
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
                    <div className="navdest"><b>📍 {nav.to.address}</b>{nav.to.name ? ` · ${nav.to.name}` : ""}{!onRoute && gps ? " · letértél az útvonalról" : ""}</div>
                    {navStop && navPapers.length > 0 && (
                      <div className="navpap">
                        <span>Leadandó:</span>
                        {navPapers.map(({ p, st }) => (
                          <button key={p.id} className={`chip ${st ?? ""}${!st ? " todo" : ""}`} onClick={() => cycle(navStop, p)}>
                            {p.paper}{st ? " · " + LABEL[st] + sinceTxt(p.id) : ""}
                          </button>
                        ))}
                      </div>
                    )}
                    {navStop?.note && <div className="sn">⚠ {navStop.note}</div>}
                    <div className="mt" style={{ marginTop: 6 }}>
                      <button onClick={() => startNav(nav.to, true)}>Újratervezés</button>
                      <button className={voice ? "on" : ""} onClick={() => setVoice(!voice)}>🔊 Hang</button>
                      <button onClick={() => { navOn.current = false; setAdvance(null); setNav(null); setDrive(false); setFull(false); }}>Leállítás</button>
                    </div>
                  </div>
                </>);
              })()}
            </div>
            {(() => { const loc = mapStops.filter((s) => s.lat != null && s.lon != null).length; return (
              <div className="meta" style={{ marginTop: 6 }}>{loc} / {mapStops.length} cím helye ismert{loc < mapStops.length ? ` · ${mapStops.length - loc} hely keresése folyamatban vagy sikertelen` : " · minden túra"}{hideDone ? ` · a már elintézett címek el vannak rejtve (${pins.length} látható)` : ""}</div>); })()}
            {routeLineMsg && <div className="meta" style={{ marginTop: 6 }}>{routeLineMsg}</div>}
            <div className="mt" style={{ margin: "8px 0" }}><button disabled={mapping} onClick={mapAndSort}>{mapping ? "Feltérképezés…" : "Címek feltérképezése"}</button><button disabled={mapping} onClick={async () => { if (!confirm("A túra minden címének helyét újraszámolja, a kézzel javítottakat is. Folytatod?")) return; setMapping(true); try { await geocode(true, route); await sortByProximity(true); } finally { setMapping(false); } }}>Újraszámolás</button><button onClick={watch}>Saját helyzet</button><button className={restOnly ? "on" : ""} onClick={() => setRestOnly(!restOnly)}>{restOnly ? "Teljes útvonal" : "Hátralévő útvonal"}</button></div>
            {msg && <div className="meta">{msg}</div>}
            {nx && !nav && <div className="nxb">Következő: <b>{nx.s.address}</b>{nx.d != null && ` (${Math.round(nx.d)} m)`} · <button className="all" style={{ color: "#fff", borderColor: "#fff" }} onClick={() => startNav(nx.s)}>Navigálás</button></div>}
          </>
        )}
        {sum && <pre>{sum}<br /><button onClick={() => navigator.clipboard.writeText(sum)}>Másolás</button> <button onClick={() => setSum("")}>Bezár</button></pre>}
        {note && <div className="note">{note}</div>}
        {q.trim() ? (
          <>
            <div className="meta" style={{ margin: "6px 0" }}>{found.length} találat (minden túrában)</div>
            {found.map((s) => renderCard(s, -1, s.route_id))}
          </>
        ) : full ? null : stops.map((s, i) => renderCard(s, i))}
      </main>
      {dlg && (
        <div className="ov" onClick={() => setDlg("")}>
          <div className="dlg" onClick={(e) => e.stopPropagation()}>
            {dlg === "xl" ? (<>
              <b>Excel letöltése</b>
              <label className="xlr"><span>Ettől</span><input type="date" value={xd} max={today} onChange={(e) => { setXd(e.target.value); if (e.target.value > xt) setXt(e.target.value); }} /></label>
              <label className="xlr"><span>Eddig</span><input type="date" value={xt} max={today} onChange={(e) => { setXt(e.target.value); if (e.target.value < xd) setXd(e.target.value); }} /></label>
              {(() => {
                const back = (n: number) => { const d = new Date(today + "T12:00:00"); d.setDate(d.getDate() - n); return d.toLocaleDateString("sv-SE"); };
                return <div className="mt">
                  <button className={xd === day && xt === day ? "on" : ""} onClick={() => { setXd(day); setXt(day); }}>Kiválasztott nap</button>
                  <button onClick={() => { setXd(back(6)); setXt(today); }}>Utolsó 7 nap</button>
                  <button onClick={() => { setXd(today.slice(0, 8) + "01"); setXt(today); }}>Ez a hónap</button>
                </div>;
              })()}
              <select value={xr} onChange={(e) => setXr(e.target.value)}>
                <option value="all">Minden túra</option>
                {routes.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
              <small>Lapok: Összesítő (újságonként){xd !== xt ? ", Napok (napi bontás)" : ""}, Kiküldött, Hiányzik, Lemondva, Nem kezelt – minden sorban a dátummal. Legfeljebb 93 nap.</small>
              <div className="row">
                <button onClick={() => setDlg("")}>Bezár</button>
                {(Date.parse(xt) - Date.parse(xd)) / 864e5 + 1 > 93 ? <span style={{ flex: 1, padding: 10, textAlign: "center", color: "var(--ca)" }}>Legfeljebb 93 nap</span> : <a href={`/api/export?from=${xd}&to=${xt}&route=${encodeURIComponent(xr)}`} style={{ flex: 1, padding: 10, borderRadius: 8, textAlign: "center", textDecoration: "none", background: "var(--ac)", color: "#fff" }}>⬇ Letöltés</a>}
              </div>
            </>) : dlg === "edit" ? (<>
              <b>Cím szerkesztése</b>
              <StopForm f={f} setF={setF} meta={meta} />
              {dupe && <div className="dupe bad">⛔ Ez a cím már szerepel: <b>{dupe.address}</b> ({dupe.route_id}. túra{dupe.name ? ` · ${dupe.name}` : ""}). Egy cím csak egyszer szerepelhet – az újságokat annál a címnél add hozzá.</div>}
              <div className="row"><button onClick={delStop} style={{ color: "var(--ca)" }}>Cím törlése</button><button onClick={() => setDlg("")}>Mégse</button><button className="p" onClick={saveEdit} disabled={!!dupe}>Mentés</button></div>
            </>) : dlg === "stop" ? (<>
              <b>Új cím felvétele</b>
              <select value={f.r} onChange={set("r")}>{routes.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select>
              <StopForm f={f} setF={setF} meta={meta} />
              {dupe && (() => {
                const have = new Set(dupe.papers.map((p) => p.toLowerCase()));
                const fresh = splitPapers(f.p).filter((p) => !have.has(p.toLowerCase()));
                return (
                  <div className="dupe">
                    ⚠ <b>Erre a címre már viszel ki újságot!</b><br />
                    {dupe.address} – {dupe.route_id}. túra{dupe.name ? ` · ${dupe.name}` : ""}<br />
                    Jelenleg: {dupe.papers.join(", ") || "–"}<br />
                    {fresh.length ? <>Új cím nem jön létre, csak ezek kerülnek hozzá: <b>{fresh.join(", ")}</b></> : <>A kiválasztott újságok már mind rajta vannak ezen a címen – jelölj ki újat.</>}
                  </div>
                );
              })()}
              <div className="row"><button onClick={() => setDlg("")}>Mégse</button>
                {dupe
                  ? <button className="p" onClick={saveStop} disabled={!splitPapers(f.p).some((p) => !dupe.papers.some((x) => x.toLowerCase() === p.toLowerCase()))}>➕ Hozzáadás a meglévő címhez</button>
                  : <button className="p" onClick={saveStop}>Mentés</button>}
              </div>
            </>) : (<>
              <b>Új túra felvétele</b>
              <input placeholder="Túra száma (pl. 255)" value={f.id} onChange={set("id")} />
              <input placeholder="Megjegyzés (nem kötelező)" value={f.o} onChange={set("o")} />
              <div className="row"><button onClick={() => setDlg("")}>Mégse</button><button className="p" onClick={saveRoute}>Mentés</button></div>
            </>)}
          </div>
        </div>
      )}
      {toast && <div className="toast" onClick={() => setToast("")}>{toast}</div>}
      {advance && (
        <div className="adv">
          <div>✅ <b>{advance.from.address}</b> elintézve</div>
          {advance.to
            ? <div>➡️ Következő: <b>{advance.to.address}</b> – indulás {Math.max(0, Math.ceil((advance.at - Date.now()) / 1000))} mp múlva</div>
            : <div>🎉 Ez volt az utolsó cím.</div>}
          <div className="mt" style={{ marginTop: 6 }}>
            <button className="on" onClick={() => setAdvance({ ...advance, at: Date.now() })}>{advance.to ? "Indulás most" : "Befejezés"}</button>
            <button onClick={() => setAdvance(null)}>Maradok</button>
          </div>
        </div>
      )}
      {showTop && !full && <button className="totop" aria-label="Az oldal tetejére" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>↑</button>}
      {scan && <Scan routes={routes} route={route} onSave={saveScan} onClose={() => setScan(false)} />}
    </>
  );
}

