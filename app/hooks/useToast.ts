"use client";
import { useCallback, useRef, useState } from "react";

/** Rövid, magától eltűnő üzenet. */
export function useToast(durationMs = 3500) {
  const [toast, setToast] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const show = useCallback(
    (text: string) => {
      setToast(text);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setToast(""), durationMs);
    },
    [durationMs],
  );
  return { toast, showToast: show, hideToast: () => setToast("") };
}
