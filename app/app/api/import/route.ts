import ExcelJS from "exceljs";
import { db } from "@/lib/db";
import { groupByAddress, parseWorkbook } from "@/lib/server/excel-import";
import { handle, HttpError } from "@/lib/server/http";
import { importStops } from "@/lib/server/import-stops";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

// Címek betöltése Excelből. dry=1: csak előnézet (mit töltene be), mentés nélkül.
export const POST = handle(async (req: Request) => {
  const form = await req.formData();
  const file = form.get("file");
  if (!file || typeof file === "string") throw new HttpError(400, "Nincs kiválasztott fájl.");
  const fallbackRoute = String(form.get("route") ?? "").trim();
  const routeNote = String(form.get("note") ?? "").trim();

  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load((await file.arrayBuffer()) as never);
  } catch {
    throw new HttpError(
      400,
      "A fájl nem olvasható. Csak .xlsx formátum tölthető fel (régi .xls esetén mentsd el Excelben .xlsx-ként).",
    );
  }
  const rows = parseWorkbook(wb);
  if (!rows.length) {
    throw new HttpError(400, "Nem találtam címeket. Kell egy „Cím” fejlécű oszlop (vagy a címek az A oszlopban).");
  }
  const missingRoute = rows.filter((r) => !r.route).length;
  const stops = groupByAddress(rows, fallbackRoute);

  if (form.get("dry") === "1") {
    return {
      stops: stops.length,
      papers: stops.reduce((n, s) => n + Math.max(1, s.papers.length), 0),
      routes: [...new Set(stops.map((s) => s.route).filter(Boolean))],
      noRoute: missingRoute,
      rows: stops.map(({ route, address, name, note, papers }) => ({ route, address, name, note, papers })),
      sample: stops
        .slice(0, 5)
        .map((s) => `${s.address}${s.name ? " – " + s.name : ""}${s.papers.length ? ` (${s.papers.join(", ")})` : ""}`),
    };
  }
  if (missingRoute && !fallbackRoute) {
    throw new HttpError(400, `${missingRoute} sorhoz nincs túraszám: add meg a túra számát.`);
  }
  return { ok: true, ...(await importStops(db(), stops, { fallbackRoute, routeNote })) };
});

// Minta Excel letöltése.
export const GET = handle(async () => {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Címek");
  ws.addRow(["Túra", "Sorszám", "Cím", "Név", "Újság", "Megjegyzés"]).font = { bold: true };
  ws.addRow(["", 1, "Kossuth Lajos utca 1.", "Minta Péter", "Petőfi Népe, Nemzeti Sport", "Kapu mellett a postaláda"]);
  ws.addRow(["", 2, "Kossuth Lajos utca 5.", "Minta Anna", "Petőfi Népe", ""]);
  [8, 9, 30, 26, 30, 36].forEach((w, i) => (ws.getColumn(i + 1).width = w));
  const buffer = await wb.xlsx.writeBuffer();
  return new Response(new Uint8Array(buffer as ArrayBuffer), {
    headers: { "Content-Type": XLSX, "Content-Disposition": `attachment; filename="tura_minta.xlsx"` },
  });
});
