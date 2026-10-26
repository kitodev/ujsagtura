import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { cellText, groupByAddress, parseWorkbook } from "@/lib/server/excel-import";
import { buildWorkbook, exportRange, type ExportRow } from "@/lib/server/export-workbook";
import { HttpError } from "@/lib/server/http";

function workbook(rows: unknown[][], header?: unknown[]) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Lap");
  if (header) ws.addRow(header);
  rows.forEach((r) => ws.addRow(r));
  return wb;
}

describe("Excel import", () => {
  it("felismeri a fejléceket ékezet nélkül is, és szétbontja az újságokat", () => {
    const wb = workbook(
      [
        ["253", "2", "Kossuth utca 5.", "Kiss", "PE + VAS", "kutya"],
        ["253", "1", "Fő utca 1", "", "HVG", ""],
      ],
      ["Tura", "Sorszám", "Cím", "Név", "Újság", "Megjegyzés"],
    );
    const rows = parseWorkbook(wb);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      route: "253",
      pos: 2,
      address: "Kossuth utca 5.",
      name: "Kiss",
      papers: ["PE", "VAS"],
      note: "kutya",
    });
  });

  it("fejléc nélkül: A = cím, B = név, C = újság", () => {
    const rows = parseWorkbook(workbook([["Fő utca 1", "Nagy", "PE"]]));
    expect(rows[0]).toMatchObject({ address: "Fő utca 1", name: "Nagy", papers: ["PE"] });
  });

  it("címenként összevon (más írásmód, más túra), és sorszám szerint rendez", () => {
    const stops = groupByAddress(
      [
        { seq: 0, route: "253", pos: 2, address: "Kossuth utca 5.", name: "", note: "a", papers: ["PE"] },
        { seq: 1, route: "", pos: 1, address: "Fő utca 1", name: "Nagy", note: "", papers: ["VAS"] },
        { seq: 2, route: "254", pos: 9, address: "kossuth u. 5", name: "Kiss", note: "b", papers: ["pe", "HVG"] },
      ],
      "253",
    );
    expect(stops.map((s) => s.address)).toEqual(["Fő utca 1", "Kossuth utca 5."]);
    expect(stops[1]).toMatchObject({ route: "253", name: "Kiss", note: "a · b", papers: ["PE", "HVG"] });
    expect(stops[0].route).toBe("253"); // túraszám nélkül a megadott túra
  });

  it("cellText: formázott szöveg, képlet, dátum", () => {
    expect(cellText({ richText: [{ text: "Fő " }, { text: "utca" }] })).toBe("Fő utca");
    expect(cellText({ formula: "A1", result: 12 })).toBe("12");
    expect(cellText(null)).toBe("");
  });
});

describe("Excel export", () => {
  it("időszak: egy nap, csere, túl hosszú", () => {
    expect(exportRange(new URLSearchParams("day=2026-10-24"))).toEqual({ from: "2026-10-24", to: "2026-10-24" });
    expect(exportRange(new URLSearchParams("from=2026-10-25&to=2026-10-20"))).toEqual({
      from: "2026-10-20",
      to: "2026-10-25",
    });
    expect(() => exportRange(new URLSearchParams("from=2026-01-01&to=2026-10-24"))).toThrow(HttpError);
  });

  it("munkafüzet: összesítő, napok, állapotonkénti lapok", () => {
    const row = (day: string, paper: string, status: ExportRow["status"]): ExportRow => ({
      day,
      route_id: "253",
      position: 1,
      address: "Fő utca 1",
      name: "",
      note: "",
      paper,
      status,
    });
    const wb = buildWorkbook(
      [row("2026-10-24", "PE", "delivered"), row("2026-10-24", "VAS", "cancelled"), row("2026-10-25", "PE", null)],
      "2026-10-24",
      "2026-10-25",
    );
    expect(wb.worksheets.map((w) => w.name)).toEqual([
      "Összesítő",
      "Napok",
      "Kiküldött",
      "Hiányzik",
      "Lemondva",
      "Nem kezelt",
    ]);
    const summary = wb.getWorksheet("Összesítő")!;
    expect(summary.getRow(1).getCell(1).value).toBe("Időszak: 2026-10-24 – 2026-10-25");
    expect(summary.getRow(3).values).toEqual([undefined, "PE", 1, 0, 0, 1, 2]);
    expect(wb.getWorksheet("Lemondva")!.getRow(2).getCell(7).value).toBe("Lemondva");
    expect(wb.getWorksheet("Napok")!.rowCount).toBe(3);
  });

  it("egy napnál nincs Napok lap", () => {
    expect(buildWorkbook([], "2026-10-24", "2026-10-24").getWorksheet("Napok")).toBeUndefined();
  });
});
