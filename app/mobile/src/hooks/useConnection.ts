// Internetkapcsolat figyelése, és a várólistán lévő jelölések elküldése, amint újra van hálózat.
import NetInfo from "@react-native-community/netinfo";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";

const RETRY_MS = 30_000;

export function useConnection() {
  const [online, setOnline] = useState(true);
  const [pendingMarks, setPendingMarks] = useState(0);

  const flush = useCallback(async () => setPendingMarks(await api.flushMarks()), []);

  useEffect(() => {
    setPendingMarks(api.pendingMarks());
    const unsubscribe = NetInfo.addEventListener((s) => {
      const up = !!s.isConnected && s.isInternetReachable !== false;
      setOnline((was) => {
        if (up && !was) void flush();
        return up;
      });
    });
    void flush();
    const timer = setInterval(() => api.pendingMarks() && flush(), RETRY_MS);
    return () => {
      unsubscribe();
      clearInterval(timer);
    };
  }, [flush]);

  return { online, pendingMarks, refreshPending: () => setPendingMarks(api.pendingMarks()) };
}
