// Dupla cím figyelése gépelés közben: a beírt cím szerepel-e már abban a túracsoportban, ahová kerülne.
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { AddressMatch } from "@shared/types";

const MIN_LENGTH = 4;
const DEBOUNCE_MS = 400;

/** route: a túra, amelybe a cím kerülne; exceptId: a szerkesztett cím (önmagával nem ütközik). */
export function useAddressCheck(address: string, route: string, exceptId?: string) {
  const [match, setMatch] = useState<AddressMatch | null>(null);
  useEffect(() => {
    setMatch(null);
    const a = address.trim();
    if (a.length < MIN_LENGTH) return;
    const timer = setTimeout(() => {
      api
        .checkAddress(a, route, exceptId)
        .then((r) => setMatch(r.match))
        .catch(() => {});
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [address, route, exceptId]);
  return [match, setMatch] as const;
}
