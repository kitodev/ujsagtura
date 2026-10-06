"use client";
import { useEffect, useState } from "react";

export type Meta = { papers: string[]; addresses: string[]; names: string[] };
type F = { a: string; n: string; p: string; o: string; lat: number | null; lon: number | null };
type Sug = { label: string; lat?: number; lon?: number; own?: boolean };
type Osm = { lat: string; lon: string; address?: { road?: string; house_number?: string } };

// Cím / név / újságok űrlap: beírható és választható is (elgépelés ellen)
export default function StopForm<T extends F>({ f, setF, meta }: { f: T; setF: (v: T) => void; meta: Meta }) {
  const [sug, setSug] = useState<Sug[]>([]);
  const [open, setOpen] = useState(false);
  const [np, setNp] = useState("");
  const sel = f.p.split(",").map((x) => x.trim()).filter(Boolean);
  const setP = (l: string[]) => setF({ ...f, p: l.join(", ") });
  const toggle = (p: string) => setP(sel.includes(p) ? sel.filter((x) => x !== p) : [...sel, p]);
  const addNew = () => {
    const v = np.trim();
    if (v && !sel.some((x) => x.toLowerCase() === v.toLowerCase())) setP([...sel, v]);
    setNp("");
  };

  useEffect(() => {
    const q = f.a.trim();
    if (!open || q.length < 3) { setSug([]); return; }
    const own: Sug[] = meta.addresses.filter((a) => a.toLowerCase().includes(q.toLowerCase())).slice(0, 4).map((label) => ({ label, own: true }));
    setSug(own);
    const t = setTimeout(async () => {
      try {
        const j: Osm[] = await (await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=6&countrycodes=hu&q=${encodeURIComponent(q + ", Kiskunhalas")}`)).json();
        const osm: Sug[] = j.filter((x) => x.address?.road && JSON.stringify(x.address).includes("Kiskunhalas"))
          .map((x) => ({ label: `${x.address!.road}${x.address!.house_number ? " " + x.address!.house_number : ""}`, lat: +x.lat, lon: +x.lon }));
        setSug([...own, ...osm.filter((o) => !own.some((w) => w.label === o.label))]);
      } catch {}
    }, 700);
    return () => clearTimeout(t);
  }, [f.a, open, meta.addresses]);

  const pick = (s: Sug) => { setF({ ...f, a: s.label, lat: s.lat ?? null, lon: s.lon ?? null }); setOpen(false); };

  return (
    <>
      <div style={{ position: "relative", display: "grid" }}>
        <input placeholder="Cím – kezdd el írni, és válassz a javaslatok közül" value={f.a}
          onChange={(e) => { setF({ ...f, a: e.target.value, lat: null, lon: null }); setOpen(true); }}
          onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 250)} />
        {open && sug.length > 0 && (
          <div className="sug">
            {sug.map((s) => (
              <button type="button" key={s.label + (s.own ? "o" : "m")} onMouseDown={(e) => e.preventDefault()} onClick={() => pick(s)}>
                {s.label} <small>{s.own ? "(már felvett)" : "(térkép)"}</small>
              </button>
            ))}
          </div>
        )}
      </div>
      <input list="nevek" placeholder="Név (nem kötelező)" value={f.n} onChange={(e) => setF({ ...f, n: e.target.value })} />
      <datalist id="nevek">{meta.names.slice(0, 400).map((n) => <option key={n} value={n} />)}</datalist>
      <small>Újságok – koppintással ki/be, vagy új név beírásával:</small>
      <div className="chips" style={{ marginTop: 0 }}>
        {[...meta.papers, ...sel.filter((s) => !meta.papers.includes(s))].map((p) => (
          <button type="button" key={p} className={`chip ${sel.includes(p) ? "delivered" : ""}`} onClick={() => toggle(p)}>
            {sel.includes(p) ? "✓ " : ""}{p}
          </button>
        ))}
      </div>
      <div className="row">
        <input style={{ flex: 2 }} placeholder="Új újság neve" value={np} onChange={(e) => setNp(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addNew(); } }} />
        <button type="button" onClick={addNew}>Hozzáad</button>
      </div>
      <input placeholder="Megjegyzés (nem kötelező)" value={f.o} onChange={(e) => setF({ ...f, o: e.target.value })} />
    </>
  );
}
