import { daysAgo, expect, test } from "./fixtures/test";

test.beforeEach(async ({ api }) => {
  api.seed([
    { id: "a", route_id: "253", address: "Kossuth utca 1.", name: "Kiss Anna", papers: ["PE", "VAS"] },
    { id: "b", route_id: "253", address: "Kossuth utca 2.", papers: ["PE"] },
    { id: "c", route_id: "255", address: "Fő utca 9.", papers: ["SPORT"] },
  ]);
});

test("az újság jelölése körbe jár, és a szerverre kerül", async ({ page, api }) => {
  await page.goto("/");
  const card = page.locator("#ca");
  const chip = card.getByRole("button", { name: /^VAS/ });
  await expect(page.getByText("0 / 3 újság kezelve")).toBeVisible();

  await chip.click();
  await expect(chip).toHaveText("VAS · Leadva");
  await chip.click();
  await expect(chip).toHaveText("VAS · Hiányzik");
  await chip.click();
  await expect(chip).toHaveText("VAS · Lemondva");
  await expect(page.locator(".toast")).toContainText("lemondva mától");
  await chip.click();
  await expect(chip).toHaveText("VAS");

  const marks = api.calls.filter((c) => c.path === "/api/deliveries").map((c) => (c.body as { status: string }).status);
  expect(marks).toEqual(["delivered", "missing", "cancelled", null]);
});

test("„Mind leadva” és a szűrők", async ({ page }) => {
  await page.goto("/");
  await page.locator("#ca").getByRole("button", { name: "Mind leadva" }).click();
  await expect(page.getByText("2 / 3 újság kezelve")).toBeVisible();

  await page.locator(".flt button", { hasText: "Hátralévő" }).click();
  await expect(page.locator(".card .ad")).toHaveText(["2. Kossuth utca 2."]);
  await page.locator(".flt button", { hasText: "Leadva" }).click();
  await expect(page.locator(".card .ad")).toHaveText(["1. Kossuth utca 1."]);
  await page.locator(".flt button", { hasText: "Leadva" }).click(); // újra koppintva kikapcsol
  await expect(page.locator(".card")).toHaveCount(2);
});

test("korábbi nap: az aznapi jelölések, és a lemondás tartós", async ({ page, api }) => {
  api.mark("a-1", daysAgo(3), "cancelled");
  api.mark("b-0", daysAgo(1), "delivered");
  await page.goto("/");
  // ma is lemondva (3 napja állították be)
  await expect(page.locator("#ca").getByRole("button", { name: /^VAS/ })).toHaveText(
    /VAS · Lemondva \(\d\d\.\d\d\. óta\)/,
  );

  await page.getByLabel("Előző nap").click();
  await expect(page.locator(".past")).toBeVisible();
  await expect(page.locator("#cb").getByRole("button", { name: /^PE/ })).toHaveText("PE · Leadva");
  await page.locator("#cb").getByRole("button", { name: /^PE/ }).click();
  const last = api.calls.filter((c) => c.path === "/api/deliveries").at(-1)!.body as { day: string };
  expect(last.day).toBe(daysAgo(1));

  await page.getByRole("button", { name: "Ma" }).click();
  await expect(page.locator(".past")).toHaveCount(0);
  await expect(page.locator("#cb").getByRole("button", { name: /^PE/ })).toHaveText("PE");
});

test("keresés minden túrában, ékezet nélkül is", async ({ page }) => {
  await page.goto("/");
  await page.getByPlaceholder(/Keresés/).fill("fo utca");
  await expect(page.getByText("1 találat (minden túrában)")).toBeVisible();
  await expect(page.locator(".card .nm")).toHaveText(" · 255. túra");
});

test("Excel: időszak választása", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "📊 Excel" }).click();
  await page.getByRole("button", { name: "Utolsó 7 nap" }).click();
  await expect(page.getByRole("link", { name: "⬇ Letöltés" })).toHaveAttribute(
    "href",
    `/api/export?from=${daysAgo(6)}&to=${daysAgo(0)}&route=all`,
  );
  await expect(page.getByText(/Napok \(napi bontás\)/)).toBeVisible();
});

test("a „fel” gomb az oldal tetejére visz", async ({ page, api }) => {
  api.seed(
    Array.from({ length: 30 }, (_, i) => ({
      id: `s${i}`,
      route_id: "253",
      address: `Hosszú utca ${i + 1}.`,
      papers: ["PE"],
    })),
  );
  await page.goto("/");
  await expect(page.locator(".totop")).toHaveCount(0);
  await page.mouse.wheel(0, 3000);
  await page.locator(".totop").click();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
});
