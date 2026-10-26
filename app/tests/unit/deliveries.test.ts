import { describe, expect, it } from "vitest";
import {
  countByStatus,
  isHandled,
  isPending,
  matchesFilter,
  nextStatus,
  nextStopAfter,
  orderedStops,
  sinceLabel,
  summaryText,
  withStatus,
} from "@/lib/deliveries";
import type { Deliveries, Stop } from "@/lib/types";

const stop = (id: string, papers: string[], located = true): Stop => ({
  id,
  position: 1,
  address: `Cím ${id}`,
  name: "",
  note: "",
  lat: located ? 46.4 : null,
  lon: located ? 19.4 : null,
  stop_papers: papers.map((p) => ({ id: `${id}-${p}`, paper: p })),
});

describe("nextStatus", () => {
  it("jelöletlen → Leadva → Hiányzik → Lemondva → jelöletlen", () => {
    expect(nextStatus(undefined)).toBe("delivered");
    expect(nextStatus("delivered")).toBe("missing");
    expect(nextStatus("missing")).toBe("cancelled");
    expect(nextStatus("cancelled")).toBeNull();
  });
});

describe("withStatus", () => {
  it("beállít és töröl, az eredetit nem módosítja", () => {
    const d: Deliveries = { a: "delivered" };
    expect(withStatus(d, "b", "missing")).toEqual({ a: "delivered", b: "missing" });
    expect(withStatus(d, "a", null)).toEqual({});
    expect(d).toEqual({ a: "delivered" });
  });
});

describe("isHandled / isPending", () => {
  const s = stop("1", ["PE", "VAS"]);
  it("bármilyen jelölés elintézettnek számít", () => {
    expect(isHandled(s, { "1-PE": "delivered", "1-VAS": "cancelled" })).toBe(true);
    expect(isHandled(s, { "1-PE": "missing", "1-VAS": "missing" })).toBe(true);
    expect(isPending(s, { "1-PE": "missing", "1-VAS": "missing" })).toBe(false);
  });
  it("egy jelöletlen újság is hátralévő", () => {
    expect(isHandled(s, { "1-PE": "delivered" })).toBe(false);
    expect(isPending(s, { "1-PE": "delivered" })).toBe(true);
  });
});

describe("matchesFilter / countByStatus", () => {
  const stops = [stop("1", ["PE", "VAS"]), stop("2", ["PE"])];
  const d: Deliveries = { "1-PE": "delivered", "1-VAS": "cancelled" };
  it("szűrők", () => {
    expect(matchesFilter(stops[0], d, "")).toBe(true);
    expect(matchesFilter(stops[0], d, "todo")).toBe(false);
    expect(matchesFilter(stops[1], d, "todo")).toBe(true);
    expect(matchesFilter(stops[0], d, "cancelled")).toBe(true);
    expect(matchesFilter(stops[1], d, "delivered")).toBe(false);
  });
  it("darabszámok", () => {
    expect(countByStatus(stops, d)).toEqual({ todo: 1, delivered: 1, missing: 0, cancelled: 1 });
  });
});

describe("nextStopAfter", () => {
  const list = [stop("1", ["PE"]), stop("2", ["PE"], false), stop("3", ["PE"]), stop("4", ["PE"])];
  it("a lista sorrendjében a következő elintézetlen, helyadattal rendelkező cím", () => {
    expect(nextStopAfter(list, null, {})?.id).toBe("1");
    expect(nextStopAfter(list, "1", {})?.id).toBe("3"); // a 2. címnek nincs helye
    expect(nextStopAfter(list, "3", { "4-PE": "delivered" })?.id).toBe("1"); // körbefordul
  });
  it("null, ha nincs több", () => {
    const all: Deliveries = { "1-PE": "delivered", "3-PE": "missing", "4-PE": "cancelled" };
    expect(nextStopAfter(list, "1", all)).toBeNull();
  });
});

describe("orderedStops", () => {
  const list = [stop("1", []), stop("2", []), stop("3", [])];
  it("az újraszámolt sorrend előre, a többi utána", () => {
    expect(orderedStops(list, ["3", "1"]).map((s) => s.id)).toEqual(["3", "1", "2"]);
    expect(orderedStops(list, [])).toBe(list);
  });
});

describe("sinceLabel / summaryText", () => {
  it("örökölt lemondás felirata", () => {
    expect(sinceLabel("2026-10-21")).toBe(" (10.21. óta)");
    expect(sinceLabel(undefined)).toBe("");
  });
  it("összesítő: csak a hiányzó és lemondott újságok", () => {
    const stops = [stop("1", ["PE", "VAS"])];
    expect(summaryText(stops, { "1-PE": "delivered", "1-VAS": "missing" }, "2026-10-25", "253")).toBe(
      "Összesítő – 2026-10-25 – 253\n\nCím 1 – VAS: Hiányzik",
    );
    expect(summaryText(stops, {}, "d", "r")).toContain("Nincs hiányzó vagy lemondott újság.");
  });
});
