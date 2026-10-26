import { expect, mapIdle, pinPosition, test } from "./fixtures/test";

const A = { lat: 46.432, lon: 19.48 };
const B = { lat: 46.436, lon: 19.486 };

test.beforeEach(async ({ api }) => {
  api.seed([
    {
      id: "a",
      route_id: "253",
      address: "Kossuth utca 1.",
      name: "Kiss Anna",
      note: "Kutya van!",
      ...A,
      papers: ["PE", "VAS"],
    },
    { id: "b", route_id: "253", address: "Kossuth utca 2.", ...B, papers: ["PE"] },
  ]);
  api.mark("a-0", new Date().toLocaleDateString("sv-SE"), "delivered");
});

test("egy koppintás: kis ablak; második: ugrás a listához", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Térkép" }).click();
  await mapIdle(page);

  let p = await pinPosition(page, A.lat, A.lon);
  await page.mouse.click(p.x, p.y);
  const popup = page.locator(".pin-info");
  await expect(popup).toContainText("Kossuth utca 1.");
  await expect(popup).toContainText("Kiss Anna");
  await expect(popup).toContainText("⚠ Kutya van!");
  await expect(popup.locator(".pi-chip")).toHaveText(["PE · Leadva", "VAS"]);

  await mapIdle(page); // az ablak miatt a térkép kicsit arrébb csúszik
  p = await pinPosition(page, A.lat, A.lon);
  await page.mouse.click(p.x, p.y);
  await expect(page.locator(".card.sel .ad")).toHaveText("1. Kossuth utca 1.");
  await expect(popup).toHaveCount(0);
});

test("a kártyára koppintva a térkép a címre ugrik", async ({ page }) => {
  await page.goto("/");
  await page.locator("#cb .ad").click();
  await expect(page.locator(".focus-lab")).toHaveText("Kossuth utca 2.");
  await expect(page.locator("#cb.sel")).toBeVisible();
});

test("„Hátralévő útvonal”: az elintézett címek eltűnnek, a sorrend újraszámolódik", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Térkép" }).click();
  await page.locator("#ca").getByRole("button", { name: /^VAS/ }).click(); // az 1. cím kész
  await page.getByRole("button", { name: "Hátralévő útvonal" }).click();
  await expect(page.getByText(/Hátralévő útvonal: 1 cím/)).toBeVisible();
  await expect(page.getByText(/a már elintézett címek el vannak rejtve \(1 látható\)/)).toBeVisible();
});
