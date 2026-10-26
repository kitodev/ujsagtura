"use client";
// Internetkapcsolat figyelése, és a várólistán lévő jelölések elküldése, amint újra van hálózat.
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";

const RETRY_MS = 30_000;

export function useConnection() {
  const [online, setOnline] = useState(true);
  const [pendingMarks, setPendingMarks] = useState(0);

  const flush = useCallback(async () => setPendingMarks(await api.flushMarks()), []);

  useEffect(() => {
    setOnline(navigator.onLine);
    setPendingMarks(api.pendingMarks());
    const up = () => {
      setOnline(true);
      void flush();
    };
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    void flush();
    const timer = setInterval(() => api.pendingMarks() && flush(), RETRY_MS);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
      clearInterval(timer);
    };
  }, [flush]);

  return { online, pendingMarks, refreshPending: () => setPendingMarks(api.pendingMarks()) };
}
