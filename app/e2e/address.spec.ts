import { expect, test } from "./fixtures/test";

test.beforeEach(async ({ api }) => {
  api.seed([{ id: "a", route_id: "253", address: "Kossuth utca 5.", name: "Kiss", papers: ["PE", "VAS"] }]);
});

test("dupla cím: figyelmeztet, és csak az új újságot adja hozzá", async ({ page, api }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "+ Cím" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByPlaceholder(/Cím –/).fill("kossuth u. 5");
  await expect(dialog.getByRole("alert")).toContainText("Erre a címre már viszel ki újságot!");
  await expect(dialog.getByRole("alert")).toContainText("Jelenleg: PE, VAS");

  await dialog.locator(".chip", { hasText: "PE" }).click();
  const add = dialog.getByRole("button", { name: "➕ Hozzáadás a meglévő címhez" });
  await expect(add).toBeDisabled(); // a PE már rajta van

  await dialog.locator(".chip", { hasText: "SPORT" }).click();
  await expect(dialog.getByRole("alert")).toContainText("csak ezek kerülnek hozzá: SPORT");
  await add.click();
  await expect(dialog).toHaveCount(0);

  const post = api.calls.find((c) => c.method === "POST" && c.path === "/api/stops")!.body as { merge: boolean };
  expect(post.merge).toBe(true);
  await expect(page.locator("#ca .chip")).toHaveText(["PE", "VAS", "SPORT"]);
});

test("szerkesztés: másik meglévő címre nem írható át", async ({ page, api }) => {
  api.seed([
    { id: "a", route_id: "253", address: "Kossuth utca 5.", papers: ["PE"] },
    { id: "b", route_id: "253", address: "Fő utca 3", papers: ["PE"] },
  ]);
  await page.goto("/");
  await page.locator("#cb").getByRole("button", { name: "✎ Szerkeszt" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByPlaceholder(/Cím –/).fill("Kossuth utca 5");
  await expect(dialog.getByRole("alert")).toContainText("Ez a cím már szerepel");
  await expect(dialog.getByRole("button", { name: "Mentés" })).toBeDisabled();
});

test("a „253-as napi” önálló túra: a 253-as címe is felvehető bele", async ({ page, api }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "+ Cím" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.locator("select").selectOption("253-napi");
  await dialog.getByPlaceholder(/Cím –/).fill("Kossuth utca 5.");
  await dialog.locator(".chip", { hasText: "PE" }).click();
  await page.waitForTimeout(800); // a dupla cím ellenőrzése lefutott
  await expect(dialog.getByRole("alert")).toHaveCount(0);
  page.once("dialog", (d) => d.accept()); // „a cím nem található” kérdés (nincs térképadat a tesztben)
  await dialog.getByRole("button", { name: "Mentés" }).click();
  await expect(dialog).toHaveCount(0);
  expect(api.stops.filter((s) => s.address === "Kossuth utca 5.").map((s) => s.route_id)).toEqual(["253", "253-napi"]);

  // a napi túrán belül viszont ott is csak egyszer szerepelhet
  await page.getByRole("button", { name: "+ Cím" }).click();
  await dialog.locator("select").selectOption("253-napi");
  await dialog.getByPlaceholder(/Cím –/).fill("kossuth u. 5");
  await expect(dialog.getByRole("alert")).toContainText("253-napi. túra");
});
