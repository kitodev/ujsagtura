"use client";
import { useEffect } from "react";

/** A service worker regisztrálása (internet nélküli használat). Csak biztonságos (https vagy localhost) oldalon működik. */
export function ServiceWorker() {
  useEffect(() => {
    if ("serviceWorker" in navigator && window.isSecureContext) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);
  return null;
}
