// Keresés minden túra címei és nevei között (ékezetfüggetlenül).
import { useEffect, useState } from "react";
import type { Stop, StopsResponse } from "@shared/types";
import { api } from "@/lib/api";
import { searchStops } from "@/lib/search";
import { visibleStops } from "./useTourData";

export function useSearch(text: string, day: string, version: number, absorb: (res: StopsResponse) => void) {
  const [found, setFound] = useState<Stop[]>([]);
  useEffect(() => {
    if (!text.trim()) {
      setFound([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const res = await api.stops("all", day);
        setFound(searchStops(visibleStops(res.stops), text));
        absorb(res);
      } catch {
        /* a keresés csendben marad üres */
      }
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `absorb` stabil
  }, [text, version, day]);
  return found;
}
