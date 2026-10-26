// Memóriában tárolt, egyszerűsített szerver a végponttól végpontig tartó tesztekhez (adatbázis nélkül).
// A külső szolgáltatásokat (térképcsempék, útvonaltervező, címkereső) is helyettesíti.
import type { Page, Route as PwRoute } from "@playwright/test";

type Status = "delivered" | "missing" | "cancelled" | "none";
export type SeedStop = {
  id: string;
  route_id: string;
  address: string;
  name?: string;
  note?: string;
  lat?: number | null;
  lon?: number | null;
  papers: string[];
};

const TILE = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==",
  "base64",
);

const plain = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[.,]/g, " ")
    .replace(/\butca\b/g, "u")
    .replace(/\s+/g, " ")
    .trim();

export class FakeApi {
  routes = [
    { id: "253", name: "253 túra", note: "" },
    { id: "255", name: "255 túra", note: "" },
  ];
  stops: (Omit<SeedStop, "papers"> & { position: number; stop_papers: { id: string; paper: string }[] })[] = [];
  /** „újság-azonosító|nap” → jelölés */
  marks = new Map<string, Status>();
  /** A tesztek által ellenőrizhető hívások. */
  calls: { method: string; path: string; body?: unknown }[] = [];
  /** Az útvonaltervező céljai (lon,lat). */
  routedTo: string[] = [];

  seed(stops: SeedStop[]) {
    this.stops = stops.map((s, i) => ({
      ...s,
      name: s.name ?? "",
      note: s.note ?? "",
      lat: s.lat ?? null,
      lon: s.lon ?? null,
      position: i + 1,
      stop_papers: s.papers.map((p, k) => ({ id: `${s.id}-${k}`, paper: p })),
    }));
  }

  mark(paperId: string, day: string, status: Status) {
    this.marks.set(`${paperId}|${day}`, status);
  }

  /** A szerverrel azonos szabály: aznapi jelölés, vagy egy korábbi lemondás öröklődik. */
  statusOn(paperId: string, day: string): { status?: Status; since?: string } {
    const own = this.marks.get(`${paperId}|${day}`);
    if (own) return own === "none" ? {} : { status: own };
    const earlier = [...this.marks.entries()]
      .filter(([k]) => k.startsWith(paperId + "|") && k.split("|")[1] < day)
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))[0];
    return earlier?.[1] === "cancelled" ? { status: "cancelled", since: earlier[0].split("|")[1] } : {};
  }

  async install(page: Page) {
    await page.route("https://tile.openstreetmap.org/**", (r) => r.fulfill({ body: TILE, contentType: "image/png" }));
    await page.route("https://nominatim.openstreetmap.org/**", (r) => r.fulfill({ json: [] }));
    await page.route("https://router.project-osrm.org/**", (r) => this.osrm(r));
    await page.route("**/api/**", (r) => this.handle(r));
  }

  /** Egyszerű „L” alakú útvonal: előbb észak-dél, aztán kelet-nyugat irányban. */
  private osrm(r: PwRoute) {
    const pts = r
      .request()
      .url()
      .match(/driving\/([^?]+)/)![1]
      .split(";")
      .map((x) => x.split(",").map(Number));
    if (pts.length !== 2)
      return r.fulfill({ json: { routes: [{ geometry: { coordinates: pts }, distance: 1000, duration: 120 }] } });
    const [[x1, y1], [x2, y2]] = pts;
    this.routedTo.push(`${x2},${y2}`);
    const d1 = Math.abs(y2 - y1) * 111_000;
    const d2 = Math.abs(x2 - x1) * 76_000;
    return r.fulfill({
      json: {
        routes: [
          {
            distance: d1 + d2,
            duration: (d1 + d2) / 8,
            geometry: {
              coordinates: [
                [x1, y1],
                [x1, y2],
                [x2, y2],
              ],
            },
            legs: [
              {
                steps: [
                  { name: "Fő utca", distance: d1, maneuver: { type: "depart", location: [x1, y1] } },
                  {
                    name: "Kossuth utca",
                    distance: d2,
                    maneuver: { type: "turn", modifier: "right", location: [x1, y2] },
                  },
                  { name: "", distance: 0, maneuver: { type: "arrive", location: [x2, y2] } },
                ],
              },
            ],
          },
        ],
      },
    });
  }

  private find(address: string, except?: string | null) {
    return this.stops.find((s) => s.id !== except && plain(s.address) === plain(address));
  }

  private match(s: (typeof this.stops)[number]) {
    return {
      id: s.id,
      route_id: s.route_id,
      address: s.address,
      name: s.name,
      papers: s.stop_papers.map((p) => p.paper),
    };
  }

  private async handle(r: PwRoute) {
    const req = r.request();
    const url = new URL(req.url());
    const method = req.method();
    const body = req.postData() ? req.postDataJSON() : undefined;
    this.calls.push({ method, path: url.pathname + url.search, body });
    const q = url.searchParams;

    switch (`${method} ${url.pathname}`) {
      case "GET /api/routes":
        return r.fulfill({ json: this.routes });
      case "GET /api/meta":
        return r.fulfill({
          json: { papers: ["PE", "VAS", "SPORT"], addresses: this.stops.map((s) => s.address), names: [] },
        });
      case "GET /api/stops": {
        const route = q.get("route");
        const day = q.get("day")!;
        const stops = this.stops.filter((s) => route === "all" || s.route_id === route);
        const deliveries: Record<string, string> = {};
        const since: Record<string, string> = {};
        for (const s of stops)
          for (const p of s.stop_papers) {
            const st = this.statusOn(p.id, day);
            if (st.status) deliveries[p.id] = st.status;
            if (st.since) since[p.id] = st.since;
          }
        return r.fulfill({ json: { stops, deliveries, since } });
      }
      case "PUT /api/deliveries": {
        for (const id of body.ids) {
          if (body.status) this.mark(id, body.day, body.status);
          else {
            this.marks.delete(`${id}|${body.day}`);
            if (this.statusOn(id, body.day).status === "cancelled") this.mark(id, body.day, "none");
          }
        }
        return r.fulfill({ json: { ok: true } });
      }
      case "GET /api/check-address": {
        const m = this.find(q.get("address") ?? "", q.get("except"));
        return r.fulfill({ json: { match: m ? this.match(m) : null } });
      }
      case "POST /api/stops": {
        const existing = this.find(body.address);
        if (existing) {
          if (!body.merge) return r.fulfill({ status: 409, json: { error: "dupla", match: this.match(existing) } });
          const have = existing.stop_papers.map((p) => p.paper.toLowerCase());
          const added = (body.papers as string[]).filter((p) => !have.includes(p.toLowerCase()));
          added.forEach((p) =>
            existing.stop_papers.push({ id: `${existing.id}-${existing.stop_papers.length}`, paper: p }),
          );
          return r.fulfill({ json: { ok: true, merged: true, match: this.match(existing), added } });
        }
        const id = `n${this.stops.length + 1}`;
        this.stops.push({
          id,
          route_id: body.route_id,
          address: body.address,
          name: body.name,
          note: body.note,
          lat: body.lat,
          lon: body.lon,
          position: this.stops.length + 1,
          stop_papers: (body.papers as string[]).map((p, k) => ({ id: `${id}-${k}`, paper: p })),
        });
        return r.fulfill({ json: { ok: true } });
      }
      case "PATCH /api/stops":
        return r.fulfill({ json: { ok: true } });
      case "POST /api/locate":
        return r.fulfill({ json: { results: {} } });
      default:
        return r.fulfill({ status: 404, json: { error: `nincs ilyen: ${method} ${url.pathname}` } });
    }
  }
}
