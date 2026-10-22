"use client";
import { useRef, useState } from "react";

const PAP = ["Vas. Nemzeti Sport", "Vasárnap Reggel", "Petőfi Népe", "Magyar Nemzet", "Nemzeti Sport", "10 SzerencseMix", "Vidék Íze", "Lakáskultúra", "Autó-Motor", "Autó Motor", "Szabad Föld", "SZAKMa", "Fanny", "Blikk", "HVG", "Hot!"];

function parseLine(l: string) {
  l = l.replace(/\s+/g, " ").trim();
  if (l.length < 4) return null;
  const ps: string[] = [];
  let r = l;
  PAP.forEach((p) => {
    const re = new RegExp(p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    if (re.test(r)) { ps.push(p); r = r.replace(re, " "); }
  });
  r = r.replace(/\s+/g, " ").trim();
  const m = r.match(/^(\D+?\s\d+[/\-\w]*\.?)\s*(.*)$/);
  return `${m ? m[1] : r} | ${m ? m[2] : ""} | ${ps.join(", ")}`;
}

async function prep(f: File) {
  const im = await createImageBitmap(f), k = Math.min(1, 2000 / Math.max(im.width, im.height));
  const c = document.createElement("canvas");
  c.width = im.width * k; c.height = im.height * k;
  const x = c.getContext("2d")!;
  x.filter = "grayscale(1) contrast(1.3)";
  x.drawImage(im, 0, 0, c.width, c.height);
  return c;
}

type Row = { route_id: string; address: string; name: string; papers: string[]; note?: string };
export default function Scan({ routes, route, onSave, onClose }: {
  routes: { id: string; name: string }[]; route: string; onSave: (rows: Row[]) => Promise<void>; onClose: () => void;
}) {
  const [t, setT] = useState(""), [r0, setR] = useState(route), [busy, setBusy] = useState(false);
  const [extra, setExtra] = useState(""); // az Excelben szereplő, még nem létező túra
  const opts = [...routes, ...(extra && !routes.some((x) => x.id === extra) ? [{ id: extra, name: `${extra} túra (új)` }] : [])];
  // ha a kiválasztott érték nincs a listában, az első túra számít (különben üres túrába mentene)
  const r = opts.some((x) => x.id === r0) ? r0 : opts[0]?.id ?? "";
  const [st, setSt] = useState("Fotózd le a címlistát (soronként egy cím, jó fényben, egyenesen).");
  const cam = useRef<HTMLInputElement>(null), pic = useRef<HTMLInputElement>(null), xl = useRef<HTMLInputElement>(null);

  async function ocr(file: File) {
    setBusy(true); setSt("Betöltés…");
    try {
      const { createWorker } = await import("tesseract.js");
      const w = await createWorker("hun", 1, { logger: (m) => setSt(m.status === "recognizing text" ? `Olvasás: ${Math.round(m.progress * 100)}%` : "Betöltés…") });
      const { data } = await w.recognize(await prep(file));
      await w.terminate();
      const out = data.text.split("\n").map(parseLine).filter(Boolean) as string[];
      setT((x) => (x ? x + "\n" : "") + out.join("\n"));
      setSt(`${out.length} sor felismerve. Javítsd a hibákat (cím | név | újságok), majd Hozzáadás.`);
    } catch { setSt("Az OCR nem sikerült (internet kell az első betöltéshez)."); }
    setBusy(false);
  }
  // Excel (.xlsx) beolvasása: a sorok a szövegmezőbe kerülnek, ott még javíthatók
  async function excel(file: File) {
    setBusy(true); setSt("Excel beolvasása…");
    try {
      const fd = new FormData();
      fd.append("file", file); fd.append("dry", "1");
      const res = await fetch("/api/import", { method: "POST", body: fd });
      const j = await res.json().catch(() => ({ error: "Hibás válasz a szervertől." }));
      if (!res.ok) throw new Error(j.error ?? "Az Excel beolvasása nem sikerült.");
      const rows = j.rows as { route: string; address: string; name: string; note: string; papers: string[] }[];
      const c = (x: string) => x.replace(/\|/g, "/").replace(/\s+/g, " ").trim();
      const out = rows.map((x) => {
        const f = [x.address, x.name, x.papers.join(", "), x.note].map(c);
        while (f.length > 1 && !f[f.length - 1]) f.pop();
        return f.join(" | ");
      });
      setT((x) => (x ? x + "\n" : "") + out.join("\n"));
      const tours = [...new Set(rows.map((x) => x.route).filter(Boolean))];
      let extra = "";
      if (tours.length === 1) {
        const isNew = !routes.some((x) => x.id === tours[0]);
        if (isNew) setExtra(tours[0]);
        setR(tours[0]);
        extra = ` A túra az Excel alapján: ${tours[0]}${isNew ? " (új túra, mentéskor létrejön)" : ""}.`;
      }
      else if (tours.length) extra = ` Az Excelben szereplő túra(k): ${tours.join(", ")} – válaszd ki lent, melyikbe kerüljenek.`;
      setSt(`${out.length} cím beolvasva az Excelből.${extra} Ellenőrizd (cím | név | újságok | megjegyzés), majd Hozzáadás.`);
    } catch (e) { setSt(e instanceof Error ? e.message : String(e)); }
    setBusy(false);
  }
  async function save() {
    const rows = t.split("\n").flatMap((l) => {
      const [a, n, p, o] = l.split("|").map((x) => x.trim());
      if (!a) return [];
      const ps = (p ?? "").split(",").map((x) => x.trim()).filter(Boolean);
      return [{ route_id: r, address: a, name: n ?? "", papers: ps.length ? ps : ["Újság"], note: o ?? "" }];
    });
    if (!r) { setSt("Válassz túrát, vagy vegyél fel egyet a „+ Túra” gombbal."); return; }
    if (rows.length) await onSave(rows); else onClose();
  }
  const pick = (e: React.ChangeEvent<HTMLInputElement>) => { const f = e.target.files?.[0]; if (f) ocr(f); e.target.value = ""; };
  const pickXl = (e: React.ChangeEvent<HTMLInputElement>) => { const f = e.target.files?.[0]; if (f) excel(f); e.target.value = ""; };

  return (
    <div className="ov" onClick={onClose}>
      <div className="dlg" onClick={(e) => e.stopPropagation()}>
        <b>Beolvasás papírról</b>
        <div className="row">
          <button disabled={busy} onClick={() => cam.current?.click()}>📷 Fotó</button>
          <button disabled={busy} onClick={() => pic.current?.click()}>🖼 Kép</button>
          <button disabled={busy} onClick={() => xl.current?.click()}>📊 Excel</button>
        </div>
        <input ref={cam} type="file" accept="image/*" capture="environment" hidden onChange={pick} />
        <input ref={pic} type="file" accept="image/*" hidden onChange={pick} />
        <input ref={xl} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden onChange={pickXl} />
        <small>{st} <a href="/api/import" style={{ color: "var(--ac)" }}>Excel minta</a></small>
        <select value={r} onChange={(e) => setR(e.target.value)}>{opts.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
        <textarea rows={9} value={t} onChange={(e) => setT(e.target.value)} placeholder="cím | név | újságok | megjegyzés"
          style={{ padding: 8, border: "1px solid var(--bd)", borderRadius: 8, background: "var(--bg)", color: "var(--tx)", font: "inherit" }} />
        <div className="row"><button onClick={onClose}>Bezár</button><button className="p" disabled={busy} onClick={save}>Hozzáadás</button></div>
      </div>
    </div>
  );
}
