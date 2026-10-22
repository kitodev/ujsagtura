import ExcelJS from "exceljs";
import { db } from "@/lib/db";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Címek betöltése Excelből (.xlsx). Felismert oszlopok (a fejléc bármelyik sorban lehet az első 15-ből):
//   Cím (kötelező) · Név · Újság (több is, vesszővel) · Megjegyzés · Túra · Sorszám
// Ha nincs Túra oszlop (vagy üres), a megadott túraszámhoz kerülnek a címek.
// Ugyanaz a cím több sorban = egy cím több újsággal (pl. a letöltött Excel formátuma is betölthető).

type Key = "route" | "pos" | "paper" | "note" | "address" | "name";
const COLS: [Key, RegExp][] = [
  ["route", /^tura|turaszam|jarat/],
  ["pos", /sorszam|^sor$|^ssz|^#$/],
  ["paper", /ujsag|^lap|termek|kiadvany|^paper/],
  ["note", /megjegyz|^megj|^note/],
  ["address", /cim|^address|^utca/],
  ["name", /nev|elofizeto|vevo|^name/],
];
const nz = (x: string) => x.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

function text(v: unknown): string {
  if (v == null) return "";
  if (v instanceof Date) return v.toLocaleDateString("sv-SE");
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    if (Array.isArray(o.richText)) return (o.richText as { text: string }[]).map((t) => t.text).join("").trim();
    if ("text" in o) return text(o.text);
    if ("result" in o) return text(o.result);
    return "";
  }
  return String(v).trim();
}

type Row = { seq: number; route: string; pos: number; address: string; name: string; note: string; papers: string[] };

function parse(wb: ExcelJS.Workbook): Row[] {
  const out: Row[] = [];
  let seq = 0;
  wb.eachSheet((ws) => {
    // fejléc keresése: az a sor, amelyben van „Cím” oszlop
    let hdr = 0;
    const map: Partial<Record<Key, number>> = {};
    for (let r = 1; r <= Math.min(15, ws.rowCount) && !hdr; r++) {
      const m: Partial<Record<Key, number>> = {};
      ws.getRow(r).eachCell((c, col) => {
        const h = nz(text(c.value));
        if (!h) return;
        const k = COLS.find(([, re]) => re.test(h))?.[0];
        if (k && m[k] == null) m[k] = col;
      });
      if (m.address != null) { hdr = r; Object.assign(map, m); }
    }
    if (!hdr) {
      // nincs fejléc: csak akkor olvassuk, ha ez az egyetlen lap → A=Cím, B=Név, C=Újság, D=Megjegyzés
      if (wb.worksheets.length > 1) return;
      Object.assign(map, { address: 1, name: 2, paper: 3, note: 4 });
    }
    const get = (row: ExcelJS.Row, k: Key) => (map[k] != null ? text(row.getCell(map[k]!).value) : "");
    for (let r = hdr + 1; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      const address = get(row, "address").replace(/\s+/g, " ");
      if (!address) continue;
      const pos = parseFloat(get(row, "pos").replace(",", "."));
      out.push({
        seq: seq++,
        route: get(row, "route").replace(/\.0$/, ""),
        pos: Number.isFinite(pos) ? pos : Infinity,
        address,
        name: get(row, "name"),
        note: get(row, "note"),
        papers: get(row, "paper").split(/[,;\n]/).map((x) => x.trim()).filter(Boolean),
      });
    }
  });
  return out;
}

type Stop = { route: string; address: string; name: string; note: string; papers: string[]; pos: number; seq: number };

function group(rows: Row[], fallback: string): Stop[] {
  const by = new Map<string, Stop>();
  for (const r of rows) {
    const route = r.route || fallback;
    const k = route + "\u0000" + nz(r.address);
    const s = by.get(k) ?? { route, address: r.address, name: "", note: "", papers: [], pos: r.pos, seq: r.seq };
    if (!s.name && r.name) s.name = r.name;
    if (r.note && !s.note.split(" · ").includes(r.note)) s.note = s.note ? `${s.note} · ${r.note}` : r.note;
    for (const p of r.papers) if (!s.papers.some((x) => nz(x) === nz(p))) s.papers.push(p);
    s.pos = Math.min(s.pos, r.pos);
    by.set(k, s);
  }
  return [...by.values()].sort((a, b) => a.route.localeCompare(b.route, "hu", { numeric: true }) || a.pos - b.pos || a.seq - b.seq);
}

const bad = (m: string) => Response.json({ error: m }, { status: 400 });

export async function POST(req: Request) {
  const fd = await req.formData();
  const file = fd.get("file");
  if (!file || typeof file === "string") return bad("Nincs kiválasztott fájl.");
  const fallback = String(fd.get("route") ?? "").trim();
  const routeNote = String(fd.get("note") ?? "").trim();
  const dry = fd.get("dry") === "1";

  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load((await file.arrayBuffer()) as never);
  } catch {
    return bad("A fájl nem olvasható. Csak .xlsx formátum tölthető fel (régi .xls esetén mentsd el Excelben .xlsx-ként).");
  }
  const rows = parse(wb);
  if (!rows.length) return bad("Nem találtam címeket. Kell egy „Cím” fejlécű oszlop (vagy a címek az A oszlopban).");
  const noRoute = rows.filter((r) => !r.route).length;
  const stops = group(rows, fallback);
  const routes = [...new Set(stops.map((s) => s.route).filter(Boolean))];

  if (dry) {
    return Response.json({
      stops: stops.length,
      papers: stops.reduce((n, s) => n + Math.max(1, s.papers.length), 0),
      routes,
      noRoute,
      rows: stops.map((s) => ({ route: s.route, address: s.address, name: s.name, note: s.note, papers: s.papers })),
      sample: stops.slice(0, 5).map((s) => `${s.address}${s.name ? " – " + s.name : ""}${s.papers.length ? " (" + s.papers.join(", ") + ")" : ""}`),
    });
  }
  if (noRoute && !fallback) return bad(`${noRoute} sorhoz nincs túraszám: add meg a túra számát.`);

  const sql = db();
  let added = 0, skipped = 0;
  for (const rid of routes) {
    await sql`insert into routes(id, name, note) values (${rid}, ${rid + " túra"}, ${rid === fallback ? routeNote : ""}) on conflict (id) do nothing`;
    const have = new Set((await sql`select address from stops where route_id = ${rid}`).map((x) => nz(x.address as string)));
    const list = stops.filter((s) => s.route === rid && !have.has(nz(s.address)));
    skipped += stops.filter((s) => s.route === rid).length - list.length;
    if (!list.length) continue;
    const [{ m }] = await sql`select coalesce(max(position), 0)::int as m from stops where route_id = ${rid}`;
    const ins = await sql`
      insert into stops(route_id, position, address, name, note)
      select ${rid}, ${m}::int + v.ord::int, v.a, v.n, v.o
      from unnest(${list.map((s) => s.address)}::text[], ${list.map((s) => s.name)}::text[], ${list.map((s) => s.note)}::text[]) with ordinality as v(a, n, o, ord)
      returning id, position`;
    const byPos = new Map(ins.map((x) => [x.position as number, x.id as string]));
    const ids: string[] = [], papers: string[] = [];
    list.forEach((s, i) => {
      const id = byPos.get(m + i + 1)!;
      for (const p of s.papers.length ? s.papers : ["Újság"]) { ids.push(id); papers.push(p); }
    });
    await sql`insert into stop_papers(stop_id, paper) select unnest(${ids}::uuid[]), unnest(${papers}::text[])`;
    added += list.length;
  }
  return Response.json({ ok: true, added, skipped, routes });
}

// Minta Excel letöltése
export async function GET() {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Címek");
  ws.addRow(["Túra", "Sorszám", "Cím", "Név", "Újság", "Megjegyzés"]);
  ws.addRow(["", 1, "Kossuth Lajos utca 1.", "Minta Péter", "Petőfi Népe, Nemzeti Sport", "Kapu mellett a postaláda"]);
  ws.addRow(["", 2, "Kossuth Lajos utca 5.", "Minta Anna", "Petőfi Népe", ""]);
  ws.getRow(1).font = { bold: true };
  [8, 9, 30, 26, 30, 36].forEach((w, i) => (ws.getColumn(i + 1).width = w));
  const buf = await wb.xlsx.writeBuffer();
  return new Response(new Uint8Array(buf as ArrayBuffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="tura_minta.xlsx"`,
    },
  });
}
