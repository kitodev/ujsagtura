import { db } from "@/lib/db";
import { HIDDEN_ROUTES } from "@/lib/hidden";
import { buildWorkbook, exportRange, type ExportRow } from "@/lib/server/export-workbook";
import { handle } from "@/lib/server/http";

export const dynamic = "force-dynamic";

// Excel-letöltés: ?day=… vagy ?from=…&to=… (legfeljebb 93 nap), ?route=… (alapból minden túra).
// Az örökölt lemondás (lásd api/deliveries) itt is minden érintett napon „Lemondva”.
export const GET = handle(async (req: Request) => {
  const params = new URL(req.url).searchParams;
  const { from, to } = exportRange(params);
  const route = params.get("route") ?? "all";
  const sql = db();
  const rows = (await sql`
    select to_char(g.day, 'YYYY-MM-DD') as day, s.route_id, s.position, s.address, s.name, s.note, p.paper,
      case when d.day = g.day::date then nullif(d.status, 'none')
           when d.status = 'cancelled' then 'cancelled' end as status
    from generate_series(${from}::date, ${to}::date, interval '1 day') as g(day)
    cross join stops s
    join stop_papers p on p.stop_id = s.id
    left join lateral (
      select x.status, x.day from deliveries x
      where x.stop_paper_id = p.id and x.day <= g.day::date order by x.day desc limit 1
    ) d on true
    where (${route}::text = 'all' or s.route_id = ${route}::text) and s.route_id <> all(${HIDDEN_ROUTES}::text[])
    order by g.day, s.route_id, s.position, p.ord`) as ExportRow[];

  const buffer = await buildWorkbook(rows, from, to).xlsx.writeBuffer();
  const period = from === to ? from : `${from}_${to}`;
  return new Response(new Uint8Array(buffer as ArrayBuffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="ujsagok_${route}_${period}.xlsx"`,
    },
  });
});
