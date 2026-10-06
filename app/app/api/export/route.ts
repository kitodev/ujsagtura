import ExcelJS from "exceljs";
import { db } from "@/lib/db";
export const dynamic = "force-dynamic";

const ST: Record<string, string> = { delivered: "Leadva", missing: "Hiányzik", cancelled: "Lemondva" };
const HEAD = ["Túra", "Sorszám", "Cím", "Név", "Újság", "Állapot", "Megjegyzés"];
const WIDTH = [8, 9, 30, 26, 20, 14, 36];

export async function GET(req: Request) {
  const u = new URL(req.url);
  const day = u.searchParams.get("day") ?? new Date().toLocaleDateString("sv-SE");
  const route = u.searchParams.get("route") ?? "all";
  const sql = db();
  const rows = await sql`
    select s.route_id, s.position, s.address, s.name, s.note, p.paper, d.status
    from stops s
    join stop_papers p on p.stop_id = s.id
    left join deliveries d on d.stop_paper_id = p.id and d.day = ${day}::date
    where (${route}::text = 'all' or s.route_id = ${route}::text)
    order by s.route_id, s.position, p.ord`;

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

  const sheet = (name: string, pick: (s: string | null) => boolean) => {
    const ws = wb.addWorksheet(name);
    ws.addRow(HEAD);
    ws.getRow(1).font = { bold: true };
    rows.filter((r) => pick(r.status)).forEach((r) =>
      ws.addRow([r.route_id, r.position, r.address, r.name, r.paper, ST[r.status] ?? "Nincs jelölve", r.note]));
    WIDTH.forEach((w, i) => (ws.getColumn(i + 1).width = w));
    ws.views = [{ state: "frozen", ySplit: 1 }];
    ws.autoFilter = { from: "A1", to: "G1" };
  };
  sheet("Kiküldött", (s) => s === "delivered");
  sheet("Hiányzik", (s) => s === "missing");
  sheet("Lemondva", (s) => s === "cancelled");
  sheet("Nem kezelt", (s) => !s);

  const buf = await wb.xlsx.writeBuffer();
  return new Response(new Uint8Array(buf as ArrayBuffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="ujsagok_${route}_${day}.xlsx"`,
    },
  });
}
