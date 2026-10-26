"use client";
import { useEffect, useState } from "react";

/** Igaz, ha az oldal `threshold` képpontnál lejjebb van görgetve. */
export function useScrolledDown(threshold = 300) {
  const [down, setDown] = useState(false);
  useEffect(() => {
    const update = () => setDown(window.scrollY > threshold);
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, [threshold]);
  return down;
}
