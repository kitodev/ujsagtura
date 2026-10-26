"use client";
// A kiemelt cím a listában (a térképről, a navigációból vagy a listából kiválasztva), és odagörgetés hozzá.
import { useEffect, useRef, useState } from "react";

export function useSelection(reloadKey: unknown) {
  const [selected, setSelected] = useState("");
  /** A kiemelt kártya fejléce (honnan jött a kiválasztás). */
  const [note, setNote] = useState("");
  const [tick, setTick] = useState(0);
  const scrolled = useRef(true);

  /** Kiemelés; `scroll`: a lista odagörget a címhez (amint a kártya megjelenik, pl. túraváltás után). */
  const select = (id: string, label = "", scroll = true) => {
    setSelected(id);
    setNote(label);
    scrolled.current = !scroll;
    setTick((t) => t + 1);
  };

  useEffect(() => {
    if (!selected || scrolled.current) return;
    let tries = 0;
    const timer = setInterval(() => {
      const card = document.getElementById("c" + selected);
      if (card) {
        card.scrollIntoView({ behavior: "smooth", block: "center" });
        scrolled.current = true;
        clearInterval(timer);
      } else if (++tries > 30) clearInterval(timer);
    }, 100);
    return () => clearInterval(timer);
  }, [selected, reloadKey, tick]);

  return { selected, note, select, clear: () => setSelected("") };
}
