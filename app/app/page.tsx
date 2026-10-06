"use client";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Pin } from "@/components/Map";
import Scan from "@/components/Scan";
import StopForm, { type Meta } from "@/components/StopForm";

const api = async (u: string, m = "GET", b?: unknown) => {
  const r = await fetch(u, { method: m, headers: { "Content-Type": "application/json" }, body: b ? JSON.stringify(b) : undefined });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
};
const MapView = dynamic(() => import("@/components/Map"), { ssr: false });

type Paper = { id: string; paper: string };
type Stop = { id: string; position: number; address: string; name: string; note: string; lat: number | null; lon: number | null; stop_papers: Paper[] };
type Route = { id: string; name: string; note: string };
const NEXT: Record<string, string | null> = { "": "delivered", delivered: "missing", missing: "cancelled", cancelled: null };
const LABEL: Record<string, string> = { delivered: "Leadva", missing: "Hiányzik", cancelled: "Lemondva" };
type Step = { name: string; distance: number; maneuver: { type: string; modifier?: string; exit?: number; location: [number, number] } };
type Nav = { to: Stop; steps: Step[]; coords: [number, number][]; dist: number; dur: number };
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
const hav = (a: { lat: number; lon: number }, b: { lat: number; lon: number }) => {
  const r = Math.PI / 180, x = (b.lat - a.lat) * r, y = (b.lon - a.lon) * r;
  const h = Math.sin(x / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(y / 2) ** 2;
  return 12742000 * Math.asin(Math.sqrt(h));
};

export default function Page() {
  const day = useMemo(() => new Date().toLocaleDateString("sv-SE"), []);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [route, setRoute] = useState("");
  const [stops, setStops] = useState<Stop[]>([]);
  const [dv, setDv] = useState<Record<string, string>>({});
  const [only, setOnly] = useState(false);
  const [showMap, setShowMap] = useState(false);
  const [gps, setGps] = useState<{ lat: number; lon: number; acc?: number } | null>(null);
  const [last, setLast] = useState<Stop | null>(null);
  const [msg, setMsg] = useState("");
  const [sum, setSum] = useState("");
  const [meta, setMeta] = useState<Meta>({ papers: [], addresses: [], names: [] });
  const [nav, setNav] = useState<Nav | null>(null);
  const [idx, setIdx] = useState(0);
  const [voice, setVoice] = useState(false);

  useEffect(() => {
    api("/api/routes").then((data: Route[]) => { setRoutes(data); setRoute((r) => r || (data[0]?.id ?? "")); }).catch(() => setMsg("Nem érhető el az adatbázis"));
  }, []);

  const load = useCallback(async (r: string) => {
    const d = await api(`/api/stops?route=${encodeURIComponent(r)}&day=${day}`);
    setStops(d.stops);
    setDv(d.deliveries);
    api("/api/meta").then(setMeta).catch(() => {});
  }, [day]);
  useEffect(() => { if (route) load(route); }, [route, load]);

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
  async function geocode() {
    for (const s of stops.filter((x) => x.lat == null)) {
      const q = geoKey(s.address);
      setMsg(`Keresés: ${q}`);
      try {
        const j = await (await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=hu&q=${encodeURIComponent(q + ", Kiskunmajsa")}`)).json();
        if (j[0]) {
          const lat = +j[0].lat, lon = +j[0].lon;
          await api(`/api/stops/${s.id}`, "PATCH", { lat, lon });
          setStops((p) => p.map((x) => (x.id === s.id ? { ...x, lat, lon } : x)));
        }
      } catch {}
      await new Promise((r) => setTimeout(r, 1100));
    }
    setMsg("Kész. A nem talált címek koordinátáit az adatbázisban (stops.lat, stops.lon) pótolhatod.");
  }
  const [dlg, setDlg] = useState<"" | "stop" | "route" | "edit" | "xl">("");
  const [f, setF] = useState({ r: "", a: "", n: "", p: "", o: "", id: "", lat: null as number | null, lon: null as number | null });
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  async function saveStop() {
    if (!f.a.trim() || !f.r) return;
    const ps = f.p.split(",").map((x) => x.trim()).filter(Boolean);
    await api("/api/stops", "POST", { route_id: f.r, address: f.a.trim(), name: f.n.trim(), note: f.o.trim(), papers: ps.length ? ps : ["Újság"], lat: f.lat, lon: f.lon });
    setDlg(""); setF({ ...f, a: "", n: "", p: "", o: "", lat: null, lon: null });
    if (f.r === route) load(route); else setRoute(f.r);
  }
  const [xd, setXd] = useState(""), [xr, setXr] = useState("all");
  const [editId, setEditId] = useState("");
  function openEdit(s: Stop) {
    setEditId(s.id);
    setF({ ...f, a: s.address, n: s.name, o: s.note, p: s.stop_papers.map((x) => x.paper).join(", "), lat: null, lon: null });
    setDlg("edit");
  }
  async function saveEdit() {
    const a = f.a.trim(); if (!a) return;
    const seen = new Set<string>();
    const ps = f.p.split(",").map((x) => x.trim()).filter((x) => x && !seen.has(x.toLowerCase()) && seen.add(x.toLowerCase()));
    await api(`/api/stops/${editId}`, "PUT", { address: a, name: f.n.trim(), note: f.o.trim(), papers: ps.length ? ps : ["Újság"], lat: f.lat, lon: f.lon });
    setDlg(""); load(route);
  }
  async function delStop() {
    if (!confirm("Biztosan törlöd ezt a címet?")) return;
    await api(`/api/stops/${editId}`, "DELETE");
    setDlg(""); load(route);
  }
  async function saveRoute() {
    const id = f.id.trim(); if (!id) return;
    await api("/api/routes", "POST", { id, note: f.o.trim() });
    setRoutes(await api("/api/routes")); setRoute(id); setDlg(""); setF({ ...f, id: "", o: "" });
  }
  const [scan, setScan] = useState(false);
  async function saveScan(rows: { route_id: string; address: string; name: string; papers: string[] }[]) {
    const have = new Set(stops.map((s) => s.address.toLowerCase()));
    for (const r of rows) {
      if (r.route_id === route && have.has(r.address.toLowerCase())) continue;
      await api("/api/stops", "POST", { ...r, note: "" });
    }
    setScan(false); setRoute(rows[0].route_id); load(rows[0].route_id);
  }
  async function startNav(to: Stop) {
    if (!gps) { alert("Előbb kapcsold be a „Saját helyzet” gombot."); return; }
    setMsg("Útvonal tervezése…");
    try {
      const j = await (await fetch(`https://router.project-osrm.org/route/v1/driving/${gps.lon},${gps.lat};${to.lon},${to.lat}?overview=full&geometries=geojson&steps=true`)).json();
      const r = j.routes?.[0]; if (!r) throw new Error();
      setNav({ to, steps: r.legs[0].steps, coords: r.geometry.coordinates.map(([x, y]: number[]) => [y, x]), dist: r.distance, dur: r.duration });
      setIdx(0); setMsg("");
    } catch { setMsg("Az útvonaltervezés nem sikerült (internet kell)."); }
  }
  const best = useRef(Infinity);
  useEffect(() => { best.current = Infinity; }, [idx, nav]);
  useEffect(() => {
    if (!nav || !gps || (gps.acc ?? 0) > 50) return;
    const st = nav.steps[idx]; if (!st) return;
    const at = (s: Step) => ({ lat: s.maneuver.location[1], lon: s.maneuver.location[0] });
    const d = hav(gps, at(st));
    // a küszöb a szakasz hosszához igazodik (12–30 m), de legalább a GPS pontatlanságához (max 25 m)
    const len = idx > 0 ? nav.steps[idx - 1].distance : 100;
    const R = Math.max(Math.min(30, Math.max(12, len * 0.3)), Math.min(gps.acc ?? 0, 25));
    const nxt = nav.steps[idx + 1];
    const passed = best.current < R * 2 && d > best.current + 10;   // közel volt, majd távolodik: elhagytuk
    const skipped = !!nxt && hav(gps, at(nxt)) < Math.min(d, 40);   // a következő pont már közelebb van
    best.current = Math.min(best.current, d);
    if (d < R || passed || skipped) {
      if (idx < nav.steps.length - 1) setIdx(idx + 1); else { setNav(null); setMsg("Megérkeztél."); }
    }
  }, [gps, nav, idx]);
  useEffect(() => {
    if (!nav || !voice || !nav.steps[idx] || typeof speechSynthesis === "undefined") return;
    const u = new SpeechSynthesisUtterance(stepText(nav.steps[idx])); u.lang = "hu-HU";
    speechSynthesis.cancel(); speechSynthesis.speak(u);
  }, [idx, nav, voice]);
  function watch() {
    navigator.geolocation?.watchPosition((p) => setGps({ lat: p.coords.latitude, lon: p.coords.longitude, acc: p.coords.accuracy }), () => alert("A helymeghatározás nincs engedélyezve"), { enableHighAccuracy: true });
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

  const pins: Pin[] = stops.flatMap((s, i) => s.lat == null ? [] : [{
    id: s.id, n: i + 1, lat: s.lat, lon: s.lon!, label: s.address,
    cls: handled(s) ? "d" : s.stop_papers.some((p) => dv[p.id]) ? "h" : nx?.s.id === s.id ? "n" : "",
  }]);
  const all = stops.flatMap((s) => s.stop_papers);
  const done = all.filter((p) => dv[p.id]).length;

  function summary() {
    const out = stops.flatMap((s) => s.stop_papers.filter((p) => dv[p.id] && dv[p.id] !== "delivered").map((p) => `${s.address} – ${p.paper}: ${LABEL[dv[p.id]]}`));
    setSum(`Összesítő – ${day} – ${route}\n\n` + (out.join("\n") || "Nincs hiányzó vagy lemondott újság."));
  }

  const note = routes.find((r) => r.id === route)?.note;

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
          <button onClick={() => { setF({ ...f, r: route }); setDlg("stop"); }}>+ Cím</button>
          <button onClick={() => setDlg("route")}>+ Túra</button>
          <button onClick={() => setScan(true)}>📷 Beolvasás</button>
          <button onClick={() => { setXd(day); setXr("all"); setDlg("xl"); }}>📊 Excel</button>
        </div>
      </header>
      <main>
        {showMap && (
          <>
            <MapView pins={pins} me={gps} line={nav?.coords ?? null} follow={!!nav} onPick={(id) => document.getElementById("c" + id)?.scrollIntoView({ behavior: "smooth", block: "center" })} />
            <div className="mt" style={{ margin: "8px 0" }}><button onClick={geocode}>Címek feltérképezése</button><button onClick={watch}>Saját helyzet</button></div>
            {msg && <div className="meta">{msg}</div>}
            {nx && !nav && <div className="nxb">Legközelebbi: <b>{nx.s.address}</b>{nx.d != null && ` (${Math.round(nx.d)} m)`} · <button className="all" style={{ color: "#fff", borderColor: "#fff" }} onClick={() => startNav(nx.s)}>Navigálás</button></div>}
            {nav && (() => {
              const st = nav.steps[idx], [lo, la] = st.maneuver.location;
              const d = gps ? Math.round(hav(gps, { lat: la, lon: lo })) : null;
              return (
                <div className="nxb">
                  <div style={{ fontSize: 18 }}><b>{stepText(st)}</b>{d != null && ` · ${d} m`}</div>
                  <div>Cél: {nav.to.address} · {(nav.dist / 1000).toFixed(1)} km · {Math.round(nav.dur / 60)} perc</div>
                  <div className="mt" style={{ marginTop: 6 }}>
                    <button onClick={() => startNav(nav.to)}>Újratervezés</button>
                    <button className={voice ? "on" : ""} onClick={() => setVoice(!voice)}>Hang</button>
                    <button onClick={() => setNav(null)}>Leállítás</button>
                  </div>
                </div>
              );
            })()}
          </>
        )}
        {sum && <pre>{sum}<br /><button onClick={() => navigator.clipboard.writeText(sum)}>Másolás</button> <button onClick={() => setSum("")}>Bezár</button></pre>}
        {note && <div className="note">{note}</div>}
        {stops.map((s, i) => {
          const d = handled(s);
          if (only && d) return null;
          return (
            <div key={s.id} id={"c" + s.id} className={`card${d ? " done" : ""}${nx?.s.id === s.id && showMap ? " nx" : ""}`}>
              <div className="top">
                <div><div className="ad">{i + 1}. {s.address}</div>{s.name && <div className="nm">{s.name}</div>}</div>
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
        })}
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

