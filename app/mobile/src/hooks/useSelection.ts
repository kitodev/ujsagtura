// A kiemelt cím a listában (a térképről, a navigációból vagy a listából kiválasztva), és odagörgetés hozzá.
import { useEffect, useRef, useState, type RefObject } from "react";
import type { ScrollViewInstance } from "react-native";

const TOP_MARGIN = 90;

export function useSelection(scroll: RefObject<ScrollViewInstance | null>, reloadKey: unknown) {
  const [selected, setSelected] = useState("");
  const [note, setNote] = useState("");
  const [tick, setTick] = useState(0);
  const scrolled = useRef(true);
  /** A kártyák helye a listán belül, és a lista helye a görgethető tartalomban. */
  const cardY = useRef(new Map<string, number>());
  const listY = useRef(0);

  const select = (id: string, label = "", scrollTo = true) => {
    setSelected(id);
    setNote(label);
    scrolled.current = !scrollTo;
    setTick((t) => t + 1);
  };

  useEffect(() => {
    if (!selected || scrolled.current) return;
    let tries = 0;
    const timer = setInterval(() => {
      const y = cardY.current.get(selected);
      if (y != null) {
        scroll.current?.scrollTo({ y: Math.max(0, listY.current + y - TOP_MARGIN), animated: true });
        scrolled.current = true;
        clearInterval(timer);
      } else if (++tries > 30) clearInterval(timer);
    }, 100);
    return () => clearInterval(timer);
  }, [selected, reloadKey, tick, scroll]);

  return {
    selected,
    note,
    select,
    clear: () => setSelected(""),
    /** A kártya helyének rögzítése (onLayout). */
    placeCard: (id: string, y: number) => cardY.current.set(id, y),
    placeList: (y: number) => {
      listY.current = y;
    },
    forget: () => cardY.current.clear(),
  };
}
