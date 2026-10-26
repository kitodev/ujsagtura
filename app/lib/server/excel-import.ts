// Címek beolvasása Excelből (.xlsx).
// Felismert oszlopok (a fejléc az első 15 sor bármelyikében lehet):
//   Cím (kötelező) · Név · Újság (több is, vesszővel vagy „+” jellel) · Megjegyzés · Túra · Sorszám
// Ha nincs fejléc és ez az egyetlen lap: A = Cím, B = Név, C = Újság, D = Megjegyzés.
// Ugyanaz a cím több sorban = egy cím több újsággal (a letöltött Excel formátuma is betölthető).
import type ExcelJS from "exceljs";
import { addrKey } from "@/lib/addr";
import { addressGroup } from "@/lib/fixed-routes";
import { splitPapers } from "@/lib/papers";

type Column = "route" | "pos" | "paper" | "note" | "address" | "name";

const HEADER_PATTERNS: [Column, RegExp][] = [
  ["route", /^tura|turaszam|jarat/],
  ["pos", /sorszam|^sor$|^ssz|^#$/],
  ["paper", /ujsag|^lap|termek|kiadvany|^paper/],
  ["note", /megjegyz|^megj|^note/],
  ["address", /cim|^address|^utca/],
  ["name", /nev|elofizeto|vevo|^name/],
];
const HEADER_SEARCH_ROWS = 15;

/** Ékezet nélküli, kisbetűs alak a fejlécek felismeréséhez. */
export const plain = (x: string) => x.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/** Egy Excel-cella szöveges értéke (formázott szöveg, képlet eredménye, dátum is). */
export function cellText(v: unknown): string {
  if (v == null) return "";
  if (v instanceof Date) return v.toLocaleDateString("sv-SE");
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    if (Array.isArray(o.richText))
      return (o.richText as { text: string }[])
        .map((t) => t.text)
        .join("")
        .trim();
    if ("text" in o) return cellText(o.text);
    if ("result" in o) return cellText(o.result);
    return "";
  }
  return String(v).trim();
}

/** Egy beolvasott sor. */
export type ImportRow = {
  seq: number;
  route: string;
  pos: number;
  address: string;
  name: string;
  note: string;
  papers: string[];
};

/** Egy összevont cím (több sorból). */
export type ImportStop = Omit<ImportRow, "seq"> & { seq: number };

function findHeader(ws: ExcelJS.Worksheet): { row: number; columns: Partial<Record<Column, number>> } | null {
  for (let r = 1; r <= Math.min(HEADER_SEARCH_ROWS, ws.rowCount); r++) {
    const columns: Partial<Record<Column, number>> = {};
    ws.getRow(r).eachCell((cell, col) => {
      const h = plain(cellText(cell.value));
      const key = h && HEADER_PATTERNS.find(([, re]) => re.test(h))?.[0];
      if (key && columns[key] == null) columns[key] = col;
    });
    if (columns.address != null) return { row: r, columns };
  }
  return null;
}

/** Az összes lap sorai. */
export function parseWorkbook(wb: ExcelJS.Workbook): ImportRow[] {
  const out: ImportRow[] = [];
  let seq = 0;
  wb.eachSheet((ws) => {
    let header = findHeader(ws);
    if (!header) {
      if (wb.worksheets.length > 1) return; // fejléc nélkül csak az egyetlen lapot olvassuk
      header = { row: 0, columns: { address: 1, name: 2, paper: 3, note: 4 } };
    }
    const { row: headerRow, columns } = header;
    const get = (row: ExcelJS.Row, c: Column) => (columns[c] != null ? cellText(row.getCell(columns[c]!).value) : "");
    for (let r = headerRow + 1; r <= ws.rowCount; r++) {
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
        papers: splitPapers(get(row, "paper")),
      });
    }
  });
  return out;
}

/**
 * Sorok összevonása címenként: egy cím csoportonként (lib/fixed-routes.ts) csak egyszer szerepel – abban a túrában, ahol először –,
 * az újságok és megjegyzések összeadódnak. Túra, majd sorszám szerint rendezve.
 */
export function groupByAddress(rows: ImportRow[], fallbackRoute: string): ImportStop[] {
  const byKey = new Map<string, ImportStop>();
  for (const r of rows) {
    const route = r.route || fallbackRoute;
    const key = `${addressGroup(route)}|${addrKey(r.address)}`;
    const s = byKey.get(key) ?? { ...r, route, name: "", note: "", papers: [] };
    if (!s.name && r.name) s.name = r.name;
    if (r.note && !s.note.split(" · ").includes(r.note)) s.note = s.note ? `${s.note} · ${r.note}` : r.note;
    s.papers = splitPapers(s.papers, r.papers);
    s.pos = Math.min(s.pos, r.pos);
    byKey.set(key, s);
  }
  return [...byKey.values()].sort(
    (a, b) => a.route.localeCompare(b.route, "hu", { numeric: true }) || a.pos - b.pos || a.seq - b.seq,
  );
}
