import { test as base, expect, type Page } from "@playwright/test";
import { FakeApi } from "./fake-api";

export { expect };

/** Minden teszt saját, üres „szervert” kap. */
export const test = base.extend<{ api: FakeApi }>({
  api: async ({ page }, use) => {
    const api = new FakeApi();
    await api.install(page);
    await use(api);
  },
});

/** Egy cím képernyőpontja a térképen (a fejlesztői módban elérhető térképpéldányból). */
export async function pinPosition(page: Page, lat: number, lon: number) {
  const map = page.locator(".mapbox canvas");
  const box = (await map.boundingBox())!;
  const p = await page.evaluate(
    ([lo, la]) =>
      (window as unknown as { __map: { project: (c: [number, number]) => { x: number; y: number } } }).__map.project([
        lo,
        la,
      ]),
    [lon, lat] as [number, number],
  );
  return { x: box.x + p.x, y: box.y + p.y };
}

/** Megvárja, hogy a térkép betöltsön és megálljon. */
export async function mapIdle(page: Page) {
  await page.waitForFunction(() => {
    const m = (window as unknown as { __map?: { loaded: () => boolean; isMoving: () => boolean } }).__map;
    return !!m && m.loaded() && !m.isMoving();
  });
}

/** Mai nap YYYY-MM-DD formában (a böngésző helyi idejében). */
export const today = () => new Date().toLocaleDateString("sv-SE");
export const daysAgo = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toLocaleDateString("sv-SE");
};
