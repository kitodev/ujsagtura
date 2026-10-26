import { expect, test } from "./fixtures/test";

// A lista sorrendje: 1, 2, 3 – a 3. cím van a legközelebb, mégis az 1. a következő.
const STOPS = [
  { id: "s1", lat: 46.433, lon: 19.48 },
  { id: "s2", lat: 46.436, lon: 19.483 },
  { id: "s3", lat: 46.4302, lon: 19.4802 },
];

test.beforeEach(async ({ api }) => {
  api.seed(STOPS.map((s, i) => ({ ...s, route_id: "253", address: `Kossuth utca ${i + 1}.`, papers: ["PE", "VAS"] })));
});

test("navigáció: a cél közelében kiemeli a címet, elintézés után a lista következőjére visz", async ({
  page,
  context,
  api,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Térkép" }).click();
  await page.getByRole("button", { name: "Saját helyzet" }).click();
  await expect(page.locator(".nxb")).toContainText("Következő: Kossuth utca 1.");

  await page.getByRole("button", { name: "Navigálás" }).click();
  await expect(page.locator(".mapwrap.full .navtop")).toBeVisible();
  await expect(page.locator(".navpap .chip")).toHaveText(["PE", "VAS"]);

  // séta a cél felé
  for (let lat = 46.4305; lat <= 46.433; lat += 0.0008) {
    await context.setGeolocation({ latitude: lat, longitude: 19.48, accuracy: 8 });
    await page.waitForTimeout(400);
  }
  await expect(page.locator(".mapwrap.full")).toHaveCount(0); // közel: a térkép kicsire vált
  await expect(page.locator(".card.sel .selhd")).toContainText("A célhoz értél");

  const card = page.locator("#cs1");
  await card.getByRole("button", { name: /^PE/ }).click();
  await card.getByRole("button", { name: /^VAS/ }).click();
  await card.getByRole("button", { name: /^VAS/ }).click();
  await card.getByRole("button", { name: /^VAS/ }).click(); // Lemondva – ez is elintézett
  await expect(page.locator(".adv")).toContainText("Következő: Kossuth utca 2.");
  await page.getByRole("button", { name: "Indulás most" }).click();

  await expect.poll(() => api.routedTo.at(-1)).toBe("19.483,46.436");
  // a következő címre indul: újra teljes képernyő, alul a következő cím
  await expect(page.locator(".mapwrap.full .navdest")).toContainText("Kossuth utca 2.");
});

test("„Maradok”: nem indul tovább", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Térkép" }).click();
  await page.getByRole("button", { name: "Saját helyzet" }).click();
  await page.getByRole("button", { name: "Navigálás" }).click();
  await expect(page.locator(".navtop")).toBeVisible();
  await page.locator(".navpap .chip", { hasText: "PE" }).click();
  await page.locator(".navpap .chip", { hasText: "VAS" }).click();
  await expect(page.locator(".adv")).toBeVisible();
  await page.getByRole("button", { name: "Maradok" }).click();
  await page.waitForTimeout(4500);
  await expect(page.locator(".adv")).toHaveCount(0);
  await expect(page.locator(".navdest")).toContainText("Kossuth utca 1.");
});
