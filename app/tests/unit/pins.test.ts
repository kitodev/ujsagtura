import { describe, expect, it } from "vitest";
import { buildPins } from "@/lib/pins";
import type { Stop } from "@/lib/types";

const stop = (id: string, position: number, located = true): Stop => ({
  id,
  route_id: "R1",
  position,
  address: `Cím ${id}`,
  name: "",
  note: "",
  lat: located ? 46.4 : null,
  lon: located ? 19.4 : null,
  stop_papers: [
    { id: `${id}a`, paper: "PE" },
    { id: `${id}b`, paper: "VAS" },
  ],
});
const base = { route: "R1", restOrder: [], restOnly: false, hideDone: false };
const stops = [stop("1", 1), stop("2", 2), stop("3", 3), stop("4", 4, false)];

describe("buildPins", () => {
  it("helyadat nélküli cím nem kerül a térképre; színek állapot szerint", () => {
    const pins = buildPins(stops, {
      ...base,
      deliveries: { "1a": "delivered", "1b": "missing", "2a": "delivered" },
      nextId: "3",
    });
    expect(pins.map((p) => [p.id, p.cls])).toEqual([
      ["1", "d"],
      ["2", "h"],
      ["3", "n"],
    ]);
    expect(pins[0]).toMatchObject({ n: 1, label: "Cím 1 · R1 túra" });
  });

  it("hátralévő módban újraszámolt sorszám, a kész címek pipát kapnak", () => {
    const pins = buildPins(stops, {
      ...base,
      deliveries: { "1a": "delivered", "1b": "delivered" },
      restOrder: ["3", "2"],
      restOnly: true,
    });
    expect(pins.find((p) => p.id === "3")).toMatchObject({ n: 1, cls: "n" });
    expect(pins.find((p) => p.id === "2")).toMatchObject({ n: 2, cls: "" });
    expect(pins.find((p) => p.id === "1")?.t).toBe("✓");
  });

  it("az elintézett címek elrejthetők, a kiválasztott kivételével", () => {
    const deliveries = { "1a": "delivered", "1b": "delivered", "2a": "cancelled", "2b": "cancelled" } as const;
    expect(buildPins(stops, { ...base, deliveries, hideDone: true }).map((p) => p.id)).toEqual(["3"]);
    expect(buildPins(stops, { ...base, deliveries, hideDone: true, keepId: "1" }).map((p) => p.id)).toEqual(["1", "3"]);
  });
});
