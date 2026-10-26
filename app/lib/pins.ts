// A térkép címjelölőinek összeállítása (szám, szín) a jelölések és a nézet alapján.
import { isHandled, isPending, isTouched } from "./deliveries";
import type { Deliveries, Stop } from "./types";

/** cls: "" = jelöletlen, d = kész, h = részben kezelt, n = következő. t: a körben látható szöveg (alapból n). */
export type Pin = {
  id: string;
  n: number;
  t?: string;
  lat: number;
  lon: number;
  cls: "" | "d" | "h" | "n";
  label: string;
};

type PinOptions = {
  deliveries: Deliveries;
  /** A kiválasztott túra. */
  route: string;
  /** A következő cím azonosítója (narancs). */
  nextId?: string;
  /** „Hátralévő útvonal”: az újraszámolt sorrend azonosítói. */
  restOrder: string[];
  restOnly: boolean;
  /** A már elintézett címek elrejtése. */
  hideDone: boolean;
  /** Ezt a címet akkor is mutatjuk, ha el lenne rejtve. */
  keepId?: string;
};

export function buildPins(stops: Stop[], o: PinOptions): Pin[] {
  const restRank = new Map(o.restOrder.map((id, i) => [id, i + 1]));
  const d = o.deliveries;
  return stops.flatMap((s): Pin[] => {
    if (s.lat == null || s.lon == null) return [];
    if (o.hideDone && !isPending(s, d) && s.id !== o.keepId) return [];
    const rank = restRank.get(s.id);
    let cls: Pin["cls"];
    if (rank) cls = rank === 1 ? "n" : isTouched(s, d) ? "h" : "";
    else cls = isHandled(s, d) ? "d" : isTouched(s, d) ? "h" : o.nextId === s.id ? "n" : "";
    return [
      {
        id: s.id,
        n: rank ?? s.position,
        // hátralévő módban a már kész címek pipát kapnak, hogy ne keveredjenek az új sorszámokkal
        t: o.restOnly && s.route_id === o.route && !rank ? "✓" : undefined,
        lat: s.lat,
        lon: s.lon,
        label: `${s.address} · ${s.route_id} túra`,
        cls,
      },
    ];
  });
}
