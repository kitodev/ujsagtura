// A szerver (a webes alkalmazás API-ja) hívásai. Internet nélkül:
// - a listák a legutóbb letöltött példányból jönnek (a telefonon tárolva),
// - a jelölések várólistára kerülnek, és amint van hálózat, sorban elmennek.
import { isNetworkError, Outbox } from "@shared/outbox";
import type { AddressMatch, Meta, Route, Status, StopsResponse } from "@shared/types";
import { applyPendingMarks } from "./marks";
import { fetchWithTimeout } from "./net";
import { apiBase } from "./settings";
import { mirroredStore, readJson, writeJson } from "./storage";

const TIMEOUT_MS = 20_000;

export class ApiError extends Error {
  constructor(
    public status: number,
    public body: Record<string, unknown>,
  ) {
    super(typeof body.error === "string" ? body.error : `HTTP ${status}`);
  }
}

export class NoServerError extends Error {
  constructor() {
    super("Nincs beállítva a szerver címe (⋯ Több → ⚙ Beállítások).");
  }
}

async function request<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  const base = apiBase();
  if (!base) throw new NoServerError();
  const res = await fetchWithTimeout(
    base + path,
    {
      method,
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    },
    TIMEOUT_MS,
  );
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, json);
  return json as T;
}

/** GET a tárolóba mentve; hálózati hibánál a legutóbbi mentett válasz (ha van). */
async function cachedGet<T>(path: string, key = path): Promise<T> {
  try {
    const fresh = await request<T>(path);
    void writeJson(`cache:${key}`, fresh);
    return fresh;
  } catch (e) {
    if (!isNetworkError(e)) throw e;
    const stored = await readJson<T>(`cache:${key}`);
    if (stored == null) throw e;
    return stored;
  }
}

export type NewStop = {
  route_id: string;
  address: string;
  name: string;
  note: string;
  papers: string[];
  lat?: number | null;
  lon?: number | null;
  merge?: boolean;
};
export type StopUpdate = Omit<NewStop, "route_id" | "merge">;
export type CreateResult = { ok: true; merged?: boolean; match?: AddressMatch; added?: string[] };
export type Located = { lat: number; lon: number; kind: string; street?: string } | null;

const q = encodeURIComponent;
const outboxStore = mirroredStore("ujsagtura-outbox");
const outbox = new Outbox((m) => request("/api/deliveries", "PUT", m), outboxStore);

/** Induláskor: a várólista betöltése a telefon tárolójából. */
export const initApi = () => outboxStore.load();

/** Napi címlista. Internet nélkül a túra legutóbb letöltött listája (másik napé esetén jelölések nélkül). */
async function stops(route: string, day: string): Promise<StopsResponse> {
  type Stored = { day: string; res: StopsResponse };
  const key = `cache:stops:${route}`;
  let res: StopsResponse;
  try {
    res = await request<StopsResponse>(`/api/stops?route=${q(route)}&day=${day}`);
    void writeJson(key, { day, res } satisfies Stored);
  } catch (e) {
    if (!isNetworkError(e)) throw e;
    const stored = await readJson<Stored>(key);
    if (!stored) throw e;
    res = stored.day === day ? stored.res : { stops: stored.res.stops, deliveries: {}, since: {} };
  }
  return { ...res, deliveries: applyPendingMarks(res.deliveries, outbox.pending(), day) };
}

export const api = {
  routes: () => cachedGet<Route[]>("/api/routes"),
  createRoute: (id: string, note = "") => request("/api/routes", "POST", { id, note }),

  stops,
  createStop: (s: NewStop) => request<CreateResult>("/api/stops", "POST", s),
  updateStop: (id: string, s: StopUpdate) => request("/api/stops?id=" + q(id), "PUT", s),
  deleteStop: (id: string) => request("/api/stops?id=" + q(id), "DELETE"),
  saveLocations: (items: { id: string; lat: number; lon: number }[]) => request("/api/stops", "PATCH", { items }),
  saveOrder: (order: string[]) => request("/api/stops", "PATCH", { order }),

  /** Jelölés mentése; internet nélkül várólistára kerül (true), és később magától elmegy. */
  mark: (ids: string[], day: string, status: Status | null) => outbox.submit({ ids, day, status }),
  flushMarks: () => outbox.flush(),
  pendingMarks: () => outbox.pending().length,

  meta: () => cachedGet<Meta>("/api/meta"),
  checkAddress: (address: string, route: string, except?: string) =>
    request<{ match: AddressMatch | null }>(
      `/api/check-address?address=${q(address)}&route=${q(route)}${except ? `&except=${q(except)}` : ""}`,
    ),
  locate: (addresses: string[]) =>
    request<{ results: Record<string, Located>; houses?: boolean }>("/api/locate", "POST", { addresses }),

  /** Az Excel-letöltés teljes címe (a böngészőben nyílik meg). */
  exportUrl: (from: string, to: string, route: string) =>
    `${apiBase()}/api/export?from=${from}&to=${to}&route=${q(route)}`,
  roadsUrl: () => `${apiBase()}/api/roads`,
};
