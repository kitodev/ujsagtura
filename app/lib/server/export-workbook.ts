// Excel-összesítő készítése a napi jelölésekből.
import ExcelJS from "exceljs";
import { STATUS_LABEL } from "@/lib/deliveries";
import { daysInclusive, isISODay, todayISO } from "@/lib/dates";
import type { Status } from "@/lib/types";
import { HttpError } from "./http";

export const MAX_EXPORT_DAYS = 93;

/** Egy újság egy napon (az Excel egy sora). */
export type ExportRow = {
  day: string;
  route_id: string;
  position: number;
  address: string;
  name: string;
  note: string;
  paper: string;
  status: Status | null;
};

const SHEET_HEAD = ["Dátum", "Túra", "Sorszám", "Cím", "Név", "Újság", "Állapot", "Megjegyzés"];
const SHEET_WIDTH = [12, 8, 9, 30, 26, 20, 14, 36];
const COUNT_HEAD = ["Kiküldött", "Hiányzik", "Lemondva", "Nem kezelt", "Összesen"];

/** Időszak a kérés paramétereiből: egy nap (?day=) vagy ?from=&to=, legfeljebb 93 nap. */
export function exportRange(params: URLSearchParams): { from: string; to: string } {
  const one = params.get("day");
  let from = params.get("from");
  let to = params.get("to");
  if (!isISODay(from)) from = isISODay(one) ? one : todayISO();
  if (!isISODay(to)) to = from;
  if (to < from) [from, to] = [to, from];
  if (daysInclusive(from, to) > MAX_EXPORT_DAYS) {
    throw new HttpError(400, `Legfeljebb ${MAX_EXPORT_DAYS} nap tölthető le egyszerre.`);
  }
  return { from, to };
}

/** [kiküldött, hiányzik, lemondva, nem kezelt] */
type Counts = [number, number, number, number];
const slot = (s: Status | null) => (s === "delivered" ? 0 : s === "missing" ? 1 : s === "cancelled" ? 2 : 3);

function countBy(rows: ExportRow[], key: (r: ExportRow) => string): Map<string, Counts> {
  const out = new Map<string, Counts>();
  for (const r of rows) {
    const c = out.get(key(r)) ?? [0, 0, 0, 0];
    c[slot(r.status)]++;
    out.set(key(r), c);
  }
  return out;
}

const sum = (c: number[]) => c.reduce((a, b) => a + b, 0);

function addSummarySheet(wb: ExcelJS.Workbook, rows: ExportRow[], title: string) {
  const ws = wb.addWorksheet("Összesítő");
  ws.addRow([title]).font = { bold: true, size: 13 };
  ws.addRow(["Újság", ...COUNT_HEAD]).font = { bold: true };
  const total: Counts = [0, 0, 0, 0];
  const byPaper = [...countBy(rows, (r) => r.paper).entries()].sort((a, b) => a[0].localeCompare(b[0], "hu"));
  for (const [paper, c] of byPaper) {
    c.forEach((v, i) => (total[i] += v));
    ws.addRow([paper, ...c, sum(c)]);
  }
  ws.addRow(["Összesen", ...total, sum(total)]).font = { bold: true };
  ws.getColumn(1).width = 24;
  for (let i = 2; i <= 6; i++) ws.getColumn(i).width = 13;
}

function addDaysSheet(wb: ExcelJS.Workbook, rows: ExportRow[]) {
  const ws = wb.addWorksheet("Napok");
  ws.addRow(["Dátum", ...COUNT_HEAD]).font = { bold: true };
  for (const [day, c] of countBy(rows, (r) => r.day)) ws.addRow([day, ...c, sum(c)]);
  ws.getColumn(1).width = 12;
  for (let i = 2; i <= 6; i++) ws.getColumn(i).width = 13;
  ws.views = [{ state: "frozen", ySplit: 1 }];
}

function addListSheet(wb: ExcelJS.Workbook, name: string, rows: ExportRow[]) {
  const ws = wb.addWorksheet(name);
  ws.addRow(SHEET_HEAD).font = { bold: true };
  for (const r of rows) {
    const label = r.status ? STATUS_LABEL[r.status] : "Nincs jelölve";
    ws.addRow([r.day, r.route_id, r.position, r.address, r.name, r.paper, label, r.note]);
  }
  SHEET_WIDTH.forEach((w, i) => (ws.getColumn(i + 1).width = w));
  ws.views = [{ state: "frozen", ySplit: 1 }];
  ws.autoFilter = { from: "A1", to: "H1" };
}

/** A teljes munkafüzet: Összesítő, (több napnál) Napok, majd állapotonként egy-egy lista. */
export function buildWorkbook(rows: ExportRow[], from: string, to: string): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  const multi = from !== to;
  addSummarySheet(wb, rows, multi ? `Időszak: ${from} – ${to}` : `Nap: ${from}`);
  if (multi) addDaysSheet(wb, rows);
  addListSheet(
    wb,
    "Kiküldött",
    rows.filter((r) => r.status === "delivered"),
  );
  addListSheet(
    wb,
    "Hiányzik",
    rows.filter((r) => r.status === "missing"),
  );
  addListSheet(
    wb,
    "Lemondva",
    rows.filter((r) => r.status === "cancelled"),
  );
  addListSheet(
    wb,
    "Nem kezelt",
    rows.filter((r) => !r.status),
  );
  return wb;
}
