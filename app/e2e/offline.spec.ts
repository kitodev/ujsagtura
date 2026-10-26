import { expect, test } from "./fixtures/test";

// Internet nélkül: a navigáció a telefonra mentett úthálózatból tervez, a jelölések várólistára kerülnek.

test.beforeEach(async ({ api }) => {
  api.seed([
    { id: "s1", route_id: "253", address: "Kossuth utca 3.", lat: 46.4331, lon: 19.4839, papers: ["PE", "VAS"] },
    { id: "s2", route_id: "253", address: "Fő utca 9.", lat: 46.434, lon: 19.4801, papers: ["PE"] },
  ]);
  api.setRoads([
    [
      "Fő utca",
      [
        [46.429, 19.48],
        [46.43, 19.48],
        [46.431, 19.48],
        [46.432, 19.48],
        [46.433, 19.48],
        [46.434, 19.48],
      ],
    ],
    [
      "Kossuth utca",
      [
        [46.433, 19.48],
        [46.433, 19.482],
        [46.433, 19.484],
      ],
    ],
  ]);
  api.osrmDown = true; // az online útvonaltervező nem érhető el
});

test("navigáció internet nélkül, a mentett úthálózatból", async ({ page, api }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Térkép" }).click();
  await page.getByRole("button", { name: "Saját helyzet" }).click();
  await page.getByRole("button", { name: "Navigálás" }).click();

  await expect(page.locator(".navtop")).toBeVisible();
  // az első manőver: indulás a Fő utcán; utána: jobbra a Kossuth utcába
  await expect(page.locator(".navt")).toHaveText("Indulj el – Fő utca");
  await expect(page.locator(".navdest")).toContainText("Kossuth utca 3.");
  expect(api.routedTo).toEqual([]); // az online tervező nem adott útvonalat
});

test("a jelölés internet nélkül várólistára kerül, és később elmegy", async ({ page, api }) => {
  api.deliveriesDown = true;
  await page.goto("/");
  const chip = page.locator("#cs1").getByRole("button", { name: /^PE/ });
  await chip.click();
  await expect(chip).toHaveText("PE · Leadva");
  await expect(page.locator(".toast")).toContainText("Nincs internet");
  await expect(page.locator(".offline")).toContainText("1 jelölés vár küldésre");

  api.deliveriesDown = false;
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect(page.locator(".offline")).toHaveCount(0);
  const sent = api.calls.filter((c) => c.path === "/api/deliveries");
  expect(sent.at(-1)?.body).toMatchObject({ ids: ["s1-0"], status: "delivered" });
  expect([...api.marks.keys()]).toEqual([`s1-0|${new Date().toLocaleDateString("sv-SE")}`]);
});
