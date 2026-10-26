// Közös adattípusok (kliens és szerver).

/** Egy újság egy címen. */
export type Paper = { id: string; paper: string };

/** Egy kézbesítési cím (megálló) a túrában. */
export type Stop = {
  id: string;
  route_id?: string;
  position: number;
  address: string;
  name: string;
  note: string;
  lat: number | null;
  lon: number | null;
  stop_papers: Paper[];
};

/** Helyadattal rendelkező cím. */
export type LocatedStop = Stop & { lat: number; lon: number };

export type Route = { id: string; name: string; note: string };

/** Egy újság jelölése egy adott napon. */
export type Status = "delivered" | "missing" | "cancelled";

/** Újság-azonosító → jelölés (az adott napra). */
export type Deliveries = Record<string, Status>;

/** Szűrés a listában: "" = mind, "todo" = jelöletlen, vagy egy jelölés. */
export type StatusFilter = "" | "todo" | Status;

/** Választólisták az űrlaphoz. */
export type Meta = { papers: string[]; addresses: string[]; names: string[] };

/** Már felvett, egyező cím (dupla cím ellenőrzése). */
export type AddressMatch = { id: string; route_id: string; address: string; name: string; papers: string[] };

/** A /api/stops GET válasza. */
export type StopsResponse = {
  stops: Stop[];
  deliveries: Deliveries;
  /** Örökölt lemondás: újság-azonosító → a lemondás kezdőnapja (YYYY-MM-DD). */
  since?: Record<string, string>;
};

export const isLocated = (s: Stop): s is LocatedStop => s.lat != null && s.lon != null;
