import { describe, expect, it } from "vitest";
import type { Stop } from "@shared/types";
import { applyPendingMarks } from "@/lib/marks";
import { searchStops } from "@/lib/search";
import { clockHu, longDayHu, shortDayHu } from "@/lib/time";

const stop = (id: string, address: string, name = ""): Stop => ({
  id,
  position: 0,
  address,
  name,
  note: "",
  lat: null,
  lon: null,
  stop_papers: [],
});

describe("applyPendingMarks", () => {
  it("a várakozó jelölések felülírják a letöltött állapotot (csak az adott napon)", () => {
    const d = applyPendingMarks(
      { a: "delivered", b: "missing" },
      [
        { ids: ["a"], day: "2026-10-24", status: null },
        { ids: ["c"], day: "2026-10-24", status: "cancelled" },
        { ids: ["b"], day: "2026-10-23", status: "delivered" },
      ],
      "2026-10-24",
    );
    expect(d).toEqual({ b: "missing", c: "cancelled" });
  });

  it("sorrendben alkalmazza őket (az utolsó számít)", () => {
    const marks = [
      { ids: ["a"], day: "d", status: "missing" },
      { ids: ["a"], day: "d", status: "delivered" },
    ];
    expect(applyPendingMarks({}, marks, "d")).toEqual({ a: "delivered" });
  });
});

describe("searchStops", () => {
  const list = [stop("1", "Kossuth Lajos utca 12."), stop("2", "Szilády Áron u. 3", "Kovács Éva")];
  it("ékezetfüggetlen, címben és névben keres", () => {
    expect(searchStops(list, "kossuth").map((s) => s.id)).toEqual(["1"]);
    expect(searchStops(list, "szilady").map((s) => s.id)).toEqual(["2"]);
    expect(searchStops(list, "eva").map((s) => s.id)).toEqual(["2"]);
    expect(searchStops(list, "  ")).toEqual([]);
  });
});

describe("magyar dátum és idő", () => {
  it("formázás Intl nélkül", () => {
    expect(longDayHu("2026-10-24")).toBe("2026. október 24., szombat");
    expect(shortDayHu("2026-10-26")).toBe("okt. 26., hét");
    expect(clockHu(new Date(2026, 0, 1, 7, 5))).toBe("07:05");
  });
});
