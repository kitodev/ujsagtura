"use client";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
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
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
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
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setReady(true); });
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) return;
    supabase.from("routes").select("*").order("id").then(({ data }) => {
      setRoutes((data as Route[]) ?? []);
      setRoute((r) => r || (data?.[0]?.id ?? ""));
    });
  }, [session]);

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
  async function addStop() {
    const a = prompt("Cím (pl. Kossuth 5)"); if (!a) return;
    const n = prompt("Név (nem kötelező)") ?? "";
    const p = (prompt("Újságok, vesszővel elválasztva") ?? "").split(",").map((x) => x.trim()).filter(Boolean);
    const { data } = await supabase.from("stops").insert({ route_id: route, position: Math.max(0, ...stops.map((x) => x.position)) + 1, address: a, name: n }).select().single();
    if (data && p.length) await supabase.from("stop_papers").insert(p.map((paper) => ({ stop_id: data.id, paper })));
    load(route);
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

  if (!ready) return null;
  if (!session) return <Login />;
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
          <button onClick={addStop}>+ Cím</button>
          <button onClick={() => supabase.auth.signOut()}>Kilépés</button>
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
    </>
  );
}

function Login() {
  const [email, setEmail] = useState(""), [pw, setPw] = useState(""), [err, setErr] = useState("");
  return (
    <div className="login">
      <b>Újságtúra – belépés</b>
      <input type="email" placeholder="E-mail" value={email} onChange={(e) => setEmail(e.target.value)} />
      <input type="password" placeholder="Jelszó" value={pw} onChange={(e) => setPw(e.target.value)} />
      <button onClick={async () => { const { error } = await supabase.auth.signInWithPassword({ email, password: pw }); if (error) setErr(error.message); }}>Belépés</button>
      {err && <small>{err}</small>}
    </div>
  );
}
