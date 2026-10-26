"use client";
// Keresés minden túra címei és nevei között (ékezetfüggetlenül).
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { Stop, StopsResponse } from "@/lib/types";
import { visibleStops } from "./useTourData";

const plain = (x: string) => x.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** A címek, amelyek címében vagy nevében szerepel a keresett szöveg. */
export const searchStops = (stops: Stop[], text: string) => {
  const key = plain(text.trim());
  return key ? stops.filter((s) => plain(`${s.address} ${s.name}`).includes(key)) : [];
};

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
