import ExcelJS from "exceljs";
import { db } from "@/lib/db";
import { HIDDEN_ROUTES } from "@/lib/hidden";
export const dynamic = "force-dynamic";

const ST: Record<string, string> = { delivered: "Leadva", missing: "Hiányzik", cancelled: "Lemondva" };
const HEAD = ["Dátum", "Túra", "Sorszám", "Cím", "Név", "Újság", "Állapot", "Megjegyzés"];
const WIDTH = [12, 8, 9, 30, 26, 20, 14, 36];
const ok = (s: string | null) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);

export async function GET(req: Request) {
  const u = new URL(req.url);
  // Egy nap (?day=) vagy időszak (?from=&to=), legfeljebb 93 nap
  const one = u.searchParams.get("day");
  let from = u.searchParams.get("from"), to = u.searchParams.get("to");
  const today = new Date().toLocaleDateString("sv-SE");
  if (!ok(from)) from = ok(one) ? one : today;
  if (!ok(to)) to = from;
  if (to! < from!) [from, to] = [to, from];
  const days = (Date.parse(to!) - Date.parse(from!)) / 864e5 + 1;
  if (days > 93) return Response.json({ error: "Legfeljebb 93 nap tölthető le egyszerre." }, { status: 400 });
  const route = u.searchParams.get("route") ?? "all";
  const sql = db();
  const rows = await sql`
    select to_char(g.day, 'YYYY-MM-DD') as day, s.route_id, s.position, s.address, s.name, s.note, p.paper,
      case when d.day = g.day::date then nullif(d.status, 'none') when d.status = 'cancelled' then 'cancelled' end as status
    from generate_series(${from}::date, ${to}::date, interval '1 day') as g(day)
    cross join stops s
    join stop_papers p on p.stop_id = s.id
    left join lateral (select x.status, x.day from deliveries x where x.stop_paper_id = p.id and x.day <= g.day::date order by x.day desc limit 1) d on true
    where (${route}::text = 'all' or s.route_id = ${route}::text) and s.route_id <> all(${HIDDEN_ROUTES}::text[])
    order by g.day, s.route_id, s.position, p.ord`;
  const multi = from !== to;

  const wb = new ExcelJS.Workbook();

  // Összesítő újságonként
  const sum = wb.addWorksheet("Összesítő");
  const by = new Map<string, number[]>(); // [kiküldött, hiányzik, lemondva, nem kezelt]
  for (const r of rows) {
    const a = by.get(r.paper) ?? [0, 0, 0, 0];
    a[r.status === "delivered" ? 0 : r.status === "missing" ? 1 : r.status === "cancelled" ? 2 : 3]++;
    by.set(r.paper, a);
  }
  sum.addRow(["Újság", "Kiküldött", "Hiányzik", "Lemondva", "Nem kezelt", "Összesen"]);
  const tot = [0, 0, 0, 0];
  [...by.entries()].sort((a, b) => a[0].localeCompare(b[0], "hu")).forEach(([k, a]) => {
    a.forEach((v, i) => (tot[i] += v));
    sum.addRow([k, ...a, a.reduce((x, y) => x + y, 0)]);
  });
  sum.addRow(["Összesen", ...tot, tot.reduce((x, y) => x + y, 0)]);
  sum.getRow(1).font = { bold: true };
  sum.getRow(sum.rowCount).font = { bold: true };
  sum.getColumn(1).width = 24;
  for (let i = 2; i <= 6; i++) sum.getColumn(i).width = 13;
  sum.insertRow(1, [multi ? `Időszak: ${from} – ${to}` : `Nap: ${from}`]);
  sum.getRow(1).font = { bold: true, size: 13 };

  // Több nap esetén napi bontás is
  if (multi) {
    const nap = wb.addWorksheet("Napok");
    nap.addRow(["Dátum", "Kiküldött", "Hiányzik", "Lemondva", "Nem kezelt", "Összesen"]);
    const per = new Map<string, number[]>();
    for (const r of rows) {
      const a = per.get(r.day) ?? [0, 0, 0, 0];
      a[r.status === "delivered" ? 0 : r.status === "missing" ? 1 : r.status === "cancelled" ? 2 : 3]++;
      per.set(r.day, a);
    }
    for (const [d, a] of per) nap.addRow([d, ...a, a.reduce((x, y) => x + y, 0)]);
    nap.getRow(1).font = { bold: true };
    nap.getColumn(1).width = 12;
    for (let i = 2; i <= 6; i++) nap.getColumn(i).width = 13;
    nap.views = [{ state: "frozen", ySplit: 1 }];
  }

  const sheet = (name: string, pick: (s: string | null) => boolean) => {
    const ws = wb.addWorksheet(name);
    ws.addRow(HEAD);
    ws.getRow(1).font = { bold: true };
    rows.filter((r) => pick(r.status)).forEach((r) =>
      ws.addRow([r.day, r.route_id, r.position, r.address, r.name, r.paper, ST[r.status] ?? "Nincs jelölve", r.note]));
    WIDTH.forEach((w, i) => (ws.getColumn(i + 1).width = w));
    ws.views = [{ state: "frozen", ySplit: 1 }];
    ws.autoFilter = { from: "A1", to: "H1" };
  };
  sheet("Kiküldött", (s) => s === "delivered");
  sheet("Hiányzik", (s) => s === "missing");
  sheet("Lemondva", (s) => s === "cancelled");
  sheet("Nem kezelt", (s) => !s);

  const buf = await wb.xlsx.writeBuffer();
  return new Response(new Uint8Array(buf as ArrayBuffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="ujsagok_${route}_${multi ? `${from}_${to}` : from}.xlsx"`,
    },
  });
}
