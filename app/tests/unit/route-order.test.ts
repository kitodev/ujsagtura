import { describe, expect, it } from "vitest";
import { distanceM } from "@/lib/geo";
import { bestOrder } from "@/lib/route-order";

const pt = (id: string, lat: number, lon: number) => ({ id, lat, lon });
const length = (pts: { lat: number; lon: number }[], start?: { lat: number; lon: number }) =>
  (start ? distanceM(start, pts[0]) : 0) + pts.slice(1).reduce((s, p, i) => s + distanceM(pts[i], p), 0);

describe("bestOrder", () => {
  it("üres és egyelemű lista változatlan", () => {
    expect(bestOrder([], null)).toEqual([]);
    expect(bestOrder([pt("a", 1, 1)], null).map((p) => p.id)).toEqual(["a"]);
  });

  it("egy utca mentén sorba rendez (nincs oda-vissza)", () => {
    const street = [pt("c", 46.43, 19.03), pt("a", 46.43, 19.01), pt("d", 46.43, 19.04), pt("b", 46.43, 19.02)];
    const ids = bestOrder(street, null).map((p) => p.id);
    expect([ids.join(""), [...ids].reverse().join("")]).toContain("abcd");
  });

  it("a kezdőponthoz legközelebbi címmel indul", () => {
    const pts = [pt("far", 46.45, 19.5), pt("mid", 46.44, 19.5), pt("near", 46.431, 19.5)];
    expect(bestOrder(pts, { lat: 46.43, lon: 19.5 })[0].id).toBe("near");
  });

  it("nem hosszabb, mint az eredeti sorrend", () => {
    const pts = Array.from({ length: 12 }, (_, i) =>
      pt(String(i), 46.43 + ((i * 7) % 5) * 0.002, 19.48 + ((i * 3) % 7) * 0.002),
    );
    const start = { lat: 46.429, lon: 19.479 };
    expect(length(bestOrder(pts, start), start)).toBeLessThanOrEqual(length(pts, start) + 1e-6);
  });

  it("minden pontot pontosan egyszer tartalmaz", () => {
    const pts = Array.from({ length: 30 }, (_, i) =>
      pt(String(i), 46.4 + Math.sin(i) * 0.01, 19.4 + Math.cos(i) * 0.01),
    );
    expect(new Set(bestOrder(pts, null).map((p) => p.id)).size).toBe(30);
  });
});
