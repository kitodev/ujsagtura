import { describe, expect, it } from "vitest";
import { angleDiff, bearingDeg, circlePolygon, distanceM } from "@/lib/geo";

const A = { lat: 46.434, lon: 19.485 };

describe("distanceM", () => {
  it("0 ugyanarra a pontra", () => expect(distanceM(A, A)).toBe(0));
  it("1/1000 fok szélesség ~111 m", () => expect(distanceM(A, { ...A, lat: A.lat + 0.001 })).toBeCloseTo(111.2, 0));
  it("szimmetrikus", () => {
    const B = { lat: 46.44, lon: 19.5 };
    expect(distanceM(A, B)).toBeCloseTo(distanceM(B, A), 6);
  });
});

describe("bearingDeg", () => {
  it.each([
    [{ lat: A.lat + 0.01, lon: A.lon }, 0],
    [{ lat: A.lat, lon: A.lon + 0.01 }, 90],
    [{ lat: A.lat - 0.01, lon: A.lon }, 180],
    [{ lat: A.lat, lon: A.lon - 0.01 }, 270],
  ])("%o irány: %d°", (to, deg) => expect(bearingDeg(A, to)).toBeCloseTo(deg, 0));
});

describe("angleDiff", () => {
  it.each([
    [10, 350, 20],
    [0, 180, 180],
    [90, 90, 0],
    [359, 1, 2],
  ])("%d és %d különbsége %d", (a, b, d) => expect(angleDiff(a, b)).toBeCloseTo(d));
});

describe("circlePolygon", () => {
  it("zárt gyűrű, minden pont a sugárnyira", () => {
    const ring = circlePolygon(A, 50, 12);
    expect(ring).toHaveLength(13);
    expect(ring[0]).toEqual(ring[12].map((v) => expect.closeTo(v, 9)));
    for (const [lon, lat] of ring) expect(distanceM(A, { lat, lon })).toBeCloseTo(50, -1);
  });
});
