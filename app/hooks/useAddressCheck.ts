"use client";
// Dupla cím figyelése gépelés közben: a beírt cím szerepel-e már (bármelyik túrában).
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { AddressMatch } from "@/lib/types";

const MIN_LENGTH = 4;
const DEBOUNCE_MS = 400;

export function useAddressCheck(address: string, enabled: boolean, exceptId?: string) {
  const [match, setMatch] = useState<AddressMatch | null>(null);
  useEffect(() => {
    setMatch(null);
    const a = address.trim();
    if (!enabled || a.length < MIN_LENGTH) return;
    const timer = setTimeout(() => {
      api
        .checkAddress(a, exceptId)
        .then((r) => setMatch(r.match))
        .catch(() => {});
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [address, enabled, exceptId]);
  return [match, setMatch] as const;
}
