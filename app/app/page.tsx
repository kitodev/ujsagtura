"use client";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Pin } from "@/components/Map";

const MapView = dynamic(() => import("@/components/Map"), { ssr: false });

type Paper = { id: string; paper: string };
type Stop = { id: string; position: number; address: string; name: string; note: string; lat: number | null; lon: number | null; stop_papers: Paper[] };
type Route = { id: string; name: string; note: string };
const NEXT: Record<string, string | null> = { "": "delivered", delivered: "missing", missing: "cancelled", cancelled: null };
const LABEL: Record<string, string> = { delivered: "Leadva", missing: "Hiányzik", cancelled: "Lemondva" };
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
  const [gps, setGps] = useState<{ lat: number; lon: number } | null>(null);
  const [last, setLast] = useState<Stop | null>(null);
  const [msg, setMsg] = useState("");
  const [sum, setSum] = useState("");

  useEffect(() => {
    supabase.from("routes").select("*").order("id").then(({ data }) => {
      setRoutes((data as Route[]) ?? []);
      setRoute((r) => r || (data?.[0]?.id ?? ""));
    });
  }, []);

  const load = useCallback(async (r: string) => {
    const { data } = await supabase.from("stops").select("*, stop_papers(id,paper)").eq("route_id", r).order("position");
    setStops((data as Stop[]) ?? []);
    const d = await supabase.from("deliveries").select("stop_paper_id,status").eq("day", day);
    setDv(Object.fromEntries((d.data ?? []).map((x) => [x.stop_paper_id, x.status])));
  }, [day]);
  useEffect(() => { if (route) load(route); }, [route, load]);

  const handled = (s: Stop) => s.stop_papers.every((p) => dv[p.id]);

  async function cycle(s: Stop, p: Paper) {
    const n = NEXT[dv[p.id] ?? ""];
    setDv((o) => { const c = { ...o }; if (n) c[p.id] = n; else delete c[p.id]; return c; });
    setLast(s);
    if (n) await supabase.from("deliveries").upsert({ stop_paper_id: p.id, day, status: n, updated_at: new Date().toISOString() });
    else await supabase.from("deliveries").delete().eq("stop_paper_id", p.id).eq("day", day);
  }
  async function allDone(s: Stop) {
    const rows = s.stop_papers.filter((p) => !dv[p.id]).map((p) => ({ stop_paper_id: p.id, day, status: "delivered" }));
    setDv((o) => ({ ...o, ...Object.fromEntries(rows.map((r) => [r.stop_paper_id, "delivered"])) }));
    setLast(s);
    if (rows.length) await supabase.from("deliveries").upsert(rows);
  }
  async function geocode() {
    for (const s of stops.filter((x) => x.lat == null)) {
      const q = geoKey(s.address);
      setMsg(`Keresés: ${q}`);
      try {
        const j = await (await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=hu&q=${encodeURIComponent(q + ", Kiskunmajsa")}`)).json();
        if (j[0]) {
          const lat = +j[0].lat, lon = +j[0].lon;
          await supabase.from("stops").update({ lat, lon }).eq("id", s.id);
          setStops((p) => p.map((x) => (x.id === s.id ? { ...x, lat, lon } : x)));
        }
      } catch {}
      await new Promise((r) => setTimeout(r, 1100));
    }
    setMsg("Kész. A nem talált címeket a Supabase táblában (stops.lat/lon) pótolhatod.");
  }
  const [dlg, setDlg] = useState<"" | "stop" | "route">("");
  const [f, setF] = useState({ r: "", a: "", n: "", p: "", o: "", id: "" });
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  async function saveStop() {
    if (!f.a.trim() || !f.r) return;
    const { data: m } = await supabase.from("stops").select("position").eq("route_id", f.r).order("position", { ascending: false }).limit(1);
    const { data } = await supabase.from("stops").insert({ route_id: f.r, position: (m?.[0]?.position ?? 0) + 1, address: f.a.trim(), name: f.n.trim(), note: f.o.trim() }).select().single();
    const ps = f.p.split(",").map((x) => x.trim()).filter(Boolean);
    if (data) await supabase.from("stop_papers").insert((ps.length ? ps : ["Újság"]).map((paper) => ({ stop_id: data.id, paper })));
    setDlg(""); setF({ ...f, a: "", n: "", p: "", o: "" });
    if (f.r === route) load(route); else setRoute(f.r);
  }
  async function saveRoute() {
    const id = f.id.trim(); if (!id) return;
    await supabase.from("routes").insert({ id, name: `${id} túra`, note: f.o.trim() });
    const { data } = await supabase.from("routes").select("*").order("id");
    setRoutes((data as Route[]) ?? []); setRoute(id); setDlg(""); setF({ ...f, id: "", o: "" });
  }
  function watch() {
    navigator.geolocation?.watchPosition((p) => setGps({ lat: p.coords.latitude, lon: p.coords.longitude }), () => alert("A helymeghatározás nincs engedélyezve"), { enableHighAccuracy: true });
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
        </div>
      </header>
      <main>
        {showMap && (
          <>
            <MapView pins={pins} me={gps} onPick={(id) => document.getElementById("c" + id)?.scrollIntoView({ behavior: "smooth", block: "center" })} />
            <div className="mt" style={{ margin: "8px 0" }}><button onClick={geocode}>Címek feltérképezése</button><button onClick={watch}>Saját helyzet</button></div>
            {msg && <div className="meta">{msg}</div>}
            {nx && <div className="nxb">Legközelebbi: <b>{nx.s.address}</b>{nx.d != null && ` (${Math.round(nx.d)} m)`} · <a target="_blank" href={`https://www.google.com/maps/dir/?api=1&destination=${nx.s.lat},${nx.s.lon}&travelmode=driving`}>Navigálás</a></div>}
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
                {!d && <button className="all" onClick={() => allDone(s)}>Mind leadva</button>}
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
            {dlg === "stop" ? (<>
              <b>Új cím felvétele</b>
              <select value={f.r} onChange={set("r")}>{routes.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select>
              <input placeholder="Cím (pl. Kossuth 5)" value={f.a} onChange={set("a")} />
              <input placeholder="Név (nem kötelező)" value={f.n} onChange={set("n")} />
              <input placeholder="Újságok, vesszővel (pl. Petőfi Népe, Fanny)" value={f.p} onChange={set("p")} />
              <input placeholder="Megjegyzés (nem kötelező)" value={f.o} onChange={set("o")} />
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
    </>
  );
}

