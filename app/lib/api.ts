// A kliens oldali API-hívások egy helyen.
import { Outbox } from "./outbox";
import type { AddressMatch, Meta, Route, Status, StopsResponse } from "./types";

export class ApiError extends Error {
  constructor(
    public status: number,
    public body: Record<string, unknown>,
  ) {
    super(typeof body.error === "string" ? body.error : `HTTP ${status}`);
  }
}

async function request<T>(url: string, method = "GET", body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, json);
  return json as T;
}

export type NewStop = {
  route_id: string;
  address: string;
  name: string;
  note: string;
  papers: string[];
  lat?: number | null;
  lon?: number | null;
  /** Ha a cím már szerepel, az újságok hozzáadása a meglévőhöz (különben 409). */
  merge?: boolean;
};
export type StopUpdate = Omit<NewStop, "route_id" | "merge">;
export type CreateResult = { ok: true; merged?: boolean; match?: AddressMatch; added?: string[] };
export type Located = { lat: number; lon: number; kind: string; street?: string } | null;

const q = encodeURIComponent;

const outbox = new Outbox((m) => request("/api/deliveries", "PUT", m));

export const api = {
  routes: () => request<Route[]>("/api/routes"),
  createRoute: (id: string, note = "") => request("/api/routes", "POST", { id, note }),

  stops: (route: string, day: string) => request<StopsResponse>(`/api/stops?route=${q(route)}&day=${day}`),
  createStop: (s: NewStop) => request<CreateResult>("/api/stops", "POST", s),
  updateStop: (id: string, s: StopUpdate) => request("/api/stops?id=" + q(id), "PUT", s),
  deleteStop: (id: string) => request("/api/stops?id=" + q(id), "DELETE"),
  saveLocations: (items: { id: string; lat: number; lon: number }[]) => request("/api/stops", "PATCH", { items }),
  saveOrder: (order: string[]) => request("/api/stops", "PATCH", { order }),

  /** Jelölés mentése; internet nélkül várólistára kerül (true), és később magától elmegy. */
  mark: (ids: string[], day: string, status: Status | null) => outbox.submit({ ids, day, status }),
  /** A várólistán lévő jelölések elküldése; visszaadja, hány maradt. */
  flushMarks: () => outbox.flush(),
  pendingMarks: () => outbox.pending().length,

  meta: () => request<Meta>("/api/meta"),
  checkAddress: (address: string, route: string, except?: string) =>
    request<{ match: AddressMatch | null }>(
      `/api/check-address?address=${q(address)}&route=${q(route)}${except ? `&except=${q(except)}` : ""}`,
    ),
  locate: (addresses: string[]) =>
    request<{ results: Record<string, Located>; houses?: boolean }>("/api/locate", "POST", { addresses }),

  exportUrl: (from: string, to: string, route: string) => `/api/export?from=${from}&to=${to}&route=${q(route)}`,
};
