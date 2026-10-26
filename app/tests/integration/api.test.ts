// Az API-útvonalak valódi PostgreSQL-lel. Futtatás: TEST_DATABASE_URL=postgres://… npm test
import ExcelJS from "exceljs";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { closeDatabase, resetDatabase, sql, TEST_DB } from "./pg";

vi.mock("@/lib/db", () => ({ db: () => sql }));

const { GET: listStops, POST: createStop, PUT: updateStop } = await import("@/app/api/stops/route");
const { PUT: mark } = await import("@/app/api/deliveries/route");
const { GET: exportExcel } = await import("@/app/api/export/route");
const { POST: importExcel } = await import("@/app/api/import/route");
const { GET: checkAddress } = await import("@/app/api/check-address/route");

const json = (method: string, url: string, body?: unknown) =>
  new Request(`http://test${url}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

async function stopsOn(day: string, route = "all") {
  return (await listStops(json("GET", `/api/stops?route=${route}&day=${day}`))).json();
}
/** „cím: újság=jelölés, …” – a napi állapot olvasható formában. */
async function snapshot(day: string) {
  const r = await stopsOn(day);
  return r.stops.map(
    (s: { address: string; stop_papers: { id: string; paper: string }[] }) =>
      `${s.address}: ${s.stop_papers.map((p) => `${p.paper}=${r.deliveries[p.id] ?? "-"}${r.since[p.id] ? "*" : ""}`).join(" ")}`,
  );
}

describe.skipIf(!TEST_DB)("API (PostgreSQL)", () => {
  beforeEach(resetDatabase);
  afterAll(closeDatabase);

  describe("címek", () => {
    it("új cím: az összevont újságok külön kerülnek be", async () => {
      const res = await createStop(
        json("POST", "/api/stops", { route_id: "253", address: "Kossuth utca 5.", papers: "PE + VAS" }),
      );
      expect(res.status).toBe(200);
      expect(await snapshot("2026-10-25")).toEqual(["Kossuth utca 5.: PE=- VAS=-"]);
    });

    it("dupla cím: 409, összevonásnál csak az új újság kerül hozzá", async () => {
      await createStop(
        json("POST", "/api/stops", { route_id: "253", address: "Kossuth utca 5.", papers: ["PE", "VAS"] }),
      );
      const dup = await createStop(
        json("POST", "/api/stops", { route_id: "255", address: "kossuth u. 5", papers: ["pe", "SPORT"] }),
      );
      expect(dup.status).toBe(409);
      expect((await dup.json()).match).toMatchObject({ route_id: "253", papers: ["PE", "VAS"] });

      const merged = await createStop(
        json("POST", "/api/stops", { route_id: "255", address: "kossuth u. 5", papers: ["pe", "SPORT"], merge: true }),
      );
      expect(await merged.json()).toMatchObject({ merged: true, added: ["SPORT"] });
      expect(await snapshot("2026-10-25")).toEqual(["Kossuth utca 5.: PE=- VAS=- SPORT=-"]);
    });

    it("az önálló „253-as napi” túrába a 253-as címe is felvehető, azon belül viszont csak egyszer", async () => {
      await sql`insert into routes(id, name, note) values ('253-napi', '253-as napi', '') on conflict do nothing`;
      await createStop(json("POST", "/api/stops", { route_id: "253", address: "Kossuth utca 5.", papers: ["PE"] }));
      const napi = await createStop(
        json("POST", "/api/stops", { route_id: "253-napi", address: "kossuth u. 5", papers: ["VAS"] }),
      );
      expect(await napi.json()).toEqual({ ok: true });
      const again = await createStop(
        json("POST", "/api/stops", { route_id: "253-napi", address: "Kossuth utca 5", papers: ["X"] }),
      );
      expect(again.status).toBe(409);
      expect((await again.json()).match.route_id).toBe("253-napi");
      // a közös csoportba (pl. 255) továbbra sem vehető fel
      expect(
        (await createStop(json("POST", "/api/stops", { route_id: "255", address: "Kossuth utca 5", papers: ["X"] })))
          .status,
      ).toBe(409);
      expect(await snapshot("2026-10-25")).toEqual(["Kossuth utca 5.: PE=-", "kossuth u. 5: VAS=-"]);
    });

    it("check-address: egyező cím, a szerkesztett kivételével", async () => {
      await createStop(json("POST", "/api/stops", { route_id: "253", address: "Fő utca 1", papers: ["PE"] }));
      const [{ id }] = await sql`select id from stops`;
      const found = await (await checkAddress(json("GET", "/api/check-address?address=F%C5%91%20u.%201"))).json();
      expect(found.match?.id).toBe(id);
      const self = await (
        await checkAddress(json("GET", `/api/check-address?address=F%C5%91%20utca%201&except=${id}`))
      ).json();
      expect(self.match).toBeNull();
    });

    it("szerkesztés: másik meglévő címre nem írható át", async () => {
      await createStop(json("POST", "/api/stops", { route_id: "253", address: "Kossuth utca 5.", papers: ["PE"] }));
      await createStop(json("POST", "/api/stops", { route_id: "253", address: "Fő utca 3", papers: ["PE"] }));
      const [{ id }] = await sql`select id from stops where address = 'Fő utca 3'`;
      expect(
        (await updateStop(json("PUT", `/api/stops?id=${id}`, { address: "Kossuth utca 5", papers: ["PE"] }))).status,
      ).toBe(409);
      expect(
        (await updateStop(json("PUT", `/api/stops?id=${id}`, { address: "Fő utca 3/A", papers: "PE, HVG" }))).status,
      ).toBe(200);
      expect(await snapshot("2026-10-25")).toContain("Fő utca 3/A: PE=- HVG=-");
    });
  });

  describe("tartós lemondás", () => {
    it("a beállítás napjától érvényes, amíg át nem állítják", async () => {
      await createStop(
        json("POST", "/api/stops", { route_id: "253", address: "Kossuth utca 5.", papers: ["PE", "VAS"] }),
      );
      const [{ id: vas }] = await sql`select id from stop_papers where paper = 'VAS'`;
      const set = (day: string, status: string | null) =>
        mark(json("PUT", "/api/deliveries", { ids: [vas], day, status }));

      await set("2026-10-21", "cancelled");
      expect(await snapshot("2026-10-20")).toEqual(["Kossuth utca 5.: PE=- VAS=-"]);
      expect(await snapshot("2026-10-21")).toEqual(["Kossuth utca 5.: PE=- VAS=cancelled"]);
      expect(await snapshot("2026-11-15")).toEqual(["Kossuth utca 5.: PE=- VAS=cancelled*"]);

      await set("2026-10-24", null); // visszaállítás
      expect(await snapshot("2026-10-23")).toEqual(["Kossuth utca 5.: PE=- VAS=cancelled*"]);
      expect(await snapshot("2026-10-24")).toEqual(["Kossuth utca 5.: PE=- VAS=-"]);
      expect(await snapshot("2026-10-30")).toEqual(["Kossuth utca 5.: PE=- VAS=-"]);

      await set("2026-10-26", "cancelled");
      await set("2026-10-28", "delivered"); // más jelölés is megszünteti
      expect(await snapshot("2026-10-27")).toEqual(["Kossuth utca 5.: PE=- VAS=cancelled*"]);
      expect(await snapshot("2026-10-28")).toEqual(["Kossuth utca 5.: PE=- VAS=delivered"]);
      expect(await snapshot("2026-10-29")).toEqual(["Kossuth utca 5.: PE=- VAS=-"]);
    });
  });

  describe("adatbázis-karbantartás", () => {
    it("a duplikált és összevont újságokat rendbe teszi, a jelöléseket megtartja", async () => {
      await sql`drop index stop_papers_uniq`; // régi adatbázis: még nem volt egyediségi szabály
      await sql`insert into stops(id, route_id, position, address) values
        ('00000000-0000-0000-0000-000000000001', '253', 1, 'Kossuth utca 14.')`;
      await sql`insert into stop_papers(id, stop_id, paper) values
        ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'PE'),
        ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'PE'),
        ('10000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', 'VAS + SPORT')`;
      await sql`insert into deliveries(stop_paper_id, day, status) values
        ('10000000-0000-0000-0000-000000000002', '2026-10-25', 'missing'),
        ('10000000-0000-0000-0000-000000000003', '2026-10-25', 'delivered')`;
      vi.resetModules(); // új szerverindítás: a karbantartás újra lefut
      vi.doMock("@/lib/db", () => ({ db: () => sql }));
      const { GET } = await import("@/app/api/stops/route");
      const res = await (await GET(json("GET", "/api/stops?route=all&day=2026-10-25"))).json();
      const papers = res.stops[0].stop_papers.map(
        (p: { id: string; paper: string }) => `${p.paper}=${res.deliveries[p.id]}`,
      );
      expect(papers).toEqual(["PE=missing", "VAS=delivered", "SPORT=delivered"]);
    });
  });

  describe("túrák", () => {
    it("az állandó „253-as napi” túra magától létrejön, és nem duplázódik", async () => {
      vi.resetModules(); // új szerverindítás
      vi.doMock("@/lib/db", () => ({ db: () => sql }));
      const { GET } = await import("@/app/api/routes/route");
      const names = async () => ((await (await GET()).json()) as { id: string; name: string }[]).map((r) => r.name);
      expect(await names()).toEqual(["253 túra", "253-as napi", "255 túra"]);
      expect(await names()).toEqual(["253 túra", "253-as napi", "255 túra"]);
    });
  });

  describe("Excel", () => {
    it("export: napi bontás a tartós lemondással", async () => {
      await createStop(json("POST", "/api/stops", { route_id: "253", address: "Fő utca 1", papers: ["PE"] }));
      const [{ id }] = await sql`select id from stop_papers`;
      await mark(json("PUT", "/api/deliveries", { ids: [id], day: "2026-10-21", status: "cancelled" }));
      const res = await exportExcel(json("GET", "/api/export?from=2026-10-20&to=2026-10-23&route=253"));
      expect(res.headers.get("Content-Disposition")).toContain("ujsagok_253_2026-10-20_2026-10-23.xlsx");
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(Buffer.from(await res.arrayBuffer()) as never);
      const days: unknown[] = [];
      wb.getWorksheet("Napok")!.eachRow((r, i) => i > 1 && days.push([r.getCell(1).value, r.getCell(4).value]));
      expect(days).toEqual([
        ["2026-10-20", 0],
        ["2026-10-21", 1],
        ["2026-10-22", 1],
        ["2026-10-23", 1],
      ]);
    });

    it("import: meglévő címhez csak az új újság kerül, új cím egyszer jön létre", async () => {
      await createStop(
        json("POST", "/api/stops", { route_id: "253", address: "Kossuth utca 5.", papers: ["PE", "VAS"] }),
      );
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet("x");
      ws.addRow(["Túra", "Cím", "Név", "Újság"]);
      ws.addRow(["255", "kossuth u. 5", "", "PE + HVG"]);
      ws.addRow(["255", "Új utca 1", "Teszt", "PE"]);
      ws.addRow(["256", "Új utca 1.", "", "SPORT"]);
      const form = new FormData();
      form.set("file", new File([(await wb.xlsx.writeBuffer()) as ArrayBuffer], "a.xlsx"));
      form.set("route", "255");
      const res = await importExcel(new Request("http://test/api/import", { method: "POST", body: form }));
      expect(await res.json()).toMatchObject({ ok: true, added: 1, merged: 1 });
      expect(await snapshot("2026-10-25")).toEqual(["Kossuth utca 5.: PE=- VAS=- HVG=-", "Új utca 1: PE=- SPORT=-"]);
    });
  });
});
