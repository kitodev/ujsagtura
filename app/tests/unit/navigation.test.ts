import { describe, expect, it } from "vitest";
import {
  buildNav,
  formatDistance,
  onRouteTolerance,
  snapToRoute,
  stepIcon,
  stepText,
  upcomingStepIndex,
  type OsrmRoute,
  type Step,
} from "@/lib/navigation";
import type { Stop } from "@/lib/types";

const step = (type: string, modifier?: string, name = "", extra: Partial<Step["maneuver"]> = {}): Step => ({
  name,
  distance: 100,
  maneuver: { type, modifier, location: [0, 0], ...extra },
});

describe("stepText / stepIcon", () => {
  it.each([
    [step("depart", undefined, "Fő utca"), "Indulj el – Fő utca", "⬆"],
    [step("arrive"), "Megérkeztél", "⚑"],
    [step("turn", "right", "Kossuth utca"), "Fordulj jobbra – Kossuth utca", "➡"],
    [step("turn", "slight left"), "Fordulj enyhén balra", "↖"],
    [step("turn", "uturn"), "Fordulj vissza", "↶"],
    [step("continue", "straight", "Bajai út"), "Haladj egyenesen – Bajai út", "⬆"],
    [step("roundabout", "right", "", { exit: 2 }), "Körforgalomban hajts ki a 2. kijáraton", "⟳"],
  ])("%o", (s, text, icon) => {
    expect(stepText(s)).toBe(text);
    expect(stepIcon(s)).toBe(icon);
  });
});

describe("formatDistance", () => {
  it.each([
    [0, "0 m"],
    [-5, "0 m"],
    [14, "10 m"],
    [995, "1000 m"],
    [1000, "1.0 km"],
    [2550, "2.5 km"],
  ])("%d m → %s", (m, s) => expect(formatDistance(m)).toBe(s));
});

const to: Stop = { id: "s", position: 1, address: "Cél", name: "", note: "", lat: 46.44, lon: 19.49, stop_papers: [] };
// L alakú útvonal: északra 0.01 fok (~1112 m), majd keletre 0.005 fok (~384 m)
const route: OsrmRoute = {
  geometry: {
    coordinates: [
      [19.48, 46.43],
      [19.48, 46.44],
      [19.485, 46.44],
    ],
  },
  legs: [
    {
      steps: [
        { name: "A", distance: 1112, maneuver: { type: "depart", location: [19.48, 46.43] } },
        { name: "B", distance: 384, maneuver: { type: "turn", modifier: "right", location: [19.48, 46.44] } },
        { name: "", distance: 0, maneuver: { type: "arrive", location: [19.485, 46.44] } },
      ],
    },
  ],
  distance: 1496,
  duration: 200,
};

describe("buildNav", () => {
  const nav = buildNav(to, route);
  it("[lat, lon] pontok és összegzett távok", () => {
    expect(nav.coords[0]).toEqual([46.43, 19.48]);
    expect(nav.at[0]).toBe(0);
    expect(nav.at[1]).toBeCloseTo(1112, -1);
    expect(nav.dist).toBeCloseTo(1496, -1);
    expect(nav.stepAt).toEqual([0, 1112, 1496]);
  });
});

describe("snapToRoute", () => {
  const nav = buildNav(to, route);
  it("az útvonal melletti pontot a vonalra illeszti", () => {
    const s = snapToRoute(nav, { lat: 46.435, lon: 19.4801 });
    expect(s.i).toBe(0);
    expect(s.dist).toBeLessThan(10);
    expect(s.along).toBeCloseTo(556, -1);
    expect(s.seg).toBeCloseTo(0, 0); // észak felé
  });
  it("a második szakaszon kelet felé", () => {
    const s = snapToRoute(nav, { lat: 46.4401, lon: 19.483 });
    expect(s.i).toBe(1);
    expect(s.seg).toBeCloseTo(90, 0);
    expect(s.along).toBeGreaterThan(1112);
  });
  it("távoli pontnál nagy a távolság (letértünk)", () => {
    expect(snapToRoute(nav, { lat: 46.45, lon: 19.5 }).dist).toBeGreaterThan(1000);
  });
});

describe("upcomingStepIndex", () => {
  const nav = buildNav(to, route);
  it("a kanyar előtt a kanyar, utána az érkezés", () => {
    expect(upcomingStepIndex(nav, 500)).toBe(1);
    expect(upcomingStepIndex(nav, 1200)).toBe(2);
    expect(upcomingStepIndex(nav, 5000)).toBe(2);
  });
});

describe("onRouteTolerance", () => {
  it("25 és 45 m közé igazodik a GPS pontosságához", () => {
    expect(onRouteTolerance(undefined)).toBe(25);
    expect(onRouteTolerance(30)).toBe(30);
    expect(onRouteTolerance(200)).toBe(45);
  });
});
