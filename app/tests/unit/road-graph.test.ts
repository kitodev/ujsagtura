import { describe, expect, it } from "vitest";
import { stepText } from "@/lib/navigation";
import { buildCompactGraph, RoadGraph, turnModifier, type OverpassWay } from "@/lib/road-graph";

// Kis úthálózat: „Fő utca” észak–dél irányban, „Kossuth utca” kelet felé ágazik le a közepéről,
// „Egyirányú köz” csak kelet → nyugat irányban járható, a gyalogút nem számít.
let nextId = 1;
const way = (
  name: string,
  pts: [number, number][],
  tags: Record<string, string> = {},
  ids?: number[],
): OverpassWay => ({
  type: "way",
  id: nextId++,
  nodes: ids ?? pts.map((_, i) => 1000 * nextId + i),
  geometry: pts.map(([lat, lon]) => ({ lat, lon })),
  tags: { highway: "residential", name, ...tags },
});
const fo = way(
  "Fő utca",
  [
    [46.43, 19.48],
    [46.431, 19.48],
    [46.432, 19.48],
    [46.433, 19.48],
    [46.434, 19.48],
  ],
  {},
  [1, 2, 3, 4, 5],
);
const kossuth = way(
  "Kossuth utca",
  [
    [46.433, 19.48],
    [46.433, 19.482],
    [46.433, 19.484],
  ],
  {},
  [4, 6, 7],
);
const egyiranyu = way(
  "Egyirányú köz",
  [
    [46.431, 19.484],
    [46.431, 19.48],
  ],
  { oneway: "yes" },
  [8, 2],
);
const osszekoto = way(
  "Kert utca",
  [
    [46.433, 19.484],
    [46.431, 19.484],
  ],
  {},
  [7, 8],
);
const gyalog = way(
  "Sétány",
  [
    [46.43, 19.48],
    [46.434, 19.484],
  ],
  { highway: "footway" },
  [1, 9],
);
const graph = new RoadGraph(buildCompactGraph([fo, kossuth, egyiranyu, osszekoto, gyalog]));

describe("buildCompactGraph", () => {
  it("csak autóval járható utak, közös csomópontokon kapcsolva", () => {
    const g = buildCompactGraph([fo, kossuth, gyalog]);
    expect(g.nodes.length / 2).toBe(7); // a Fő utca 5 + a Kossuth 2 új pontja; a gyalogút kimarad
    expect(g.names).toEqual(["Fő utca", "Kossuth utca"]);
    expect(g.edges.length / 4).toBe(6);
  });
});

describe("RoadGraph", () => {
  it("legrövidebb út, kanyarral és utcanevekkel", () => {
    const r = graph.route({ lat: 46.4301, lon: 19.4801 }, { lat: 46.4331, lon: 19.4839 })!;
    expect(r.distance).toBeGreaterThan(550);
    expect(r.distance).toBeLessThan(700);
    expect(r.legs[0].steps.map(stepText)).toEqual([
      "Indulj el – Fő utca",
      "Fordulj jobbra – Kossuth utca",
      "Megérkeztél",
    ]);
    expect(r.legs[0].steps[0].distance).toBeCloseTo(322, -1);
    expect(r.geometry.coordinates[0]).toEqual([19.4801, 46.4301]); // a valódi kezdőpontról indul
  });

  it("az egyirányú utcán csak a megengedett irányba megy", () => {
    // nyugat felé (8 → 2) mehet az egyirányún
    const west = graph.route({ lat: 46.431, lon: 19.484 }, { lat: 46.431, lon: 19.4801 })!;
    expect(west.distance).toBeLessThan(400);
    // keletre nem: kerülnie kell a Kossuth utcán át
    const east = graph.route({ lat: 46.431, lon: 19.4801 }, { lat: 46.431, lon: 19.484 })!;
    expect(east.distance).toBeGreaterThan(700);
    expect(east.legs[0].steps.map((s) => s.name)).toContain("Kossuth utca");
  });

  it("nincs út: null", () => {
    const island = new RoadGraph(
      buildCompactGraph([
        fo,
        way(
          "Sziget utca",
          [
            [46.5, 19.5],
            [46.501, 19.5],
          ],
          {},
          [50, 51],
        ),
      ]),
    );
    expect(island.route({ lat: 46.43, lon: 19.48 }, { lat: 46.5005, lon: 19.5 })).toBeNull();
  });

  it("több ponton át egy összefüggő vonal", () => {
    const r = graph.routeThrough([
      { lat: 46.43, lon: 19.48 },
      { lat: 46.433, lon: 19.482 },
      { lat: 46.434, lon: 19.48 },
    ])!;
    expect(r.geometry.coordinates[0]).toEqual([19.48, 46.43]);
    expect(r.geometry.coordinates.at(-1)).toEqual([19.48, 46.434]);
    expect(r.distance).toBeGreaterThan(600);
  });
});

describe("turnModifier", () => {
  it.each([
    [5, "straight"],
    [30, "slight right"],
    [-90, "left"],
    [150, "sharp right"],
    [-175, "uturn"],
  ])("%d° → %s", (a, m) => expect(turnModifier(a)).toBe(m));
});
