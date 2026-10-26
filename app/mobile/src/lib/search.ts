// Keresés a címek és nevek között (ékezetfüggetlenül).
import type { Stop } from "@shared/types";

const plain = (x: string) => {
  try {
    return x.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  } catch {
    return x.toLowerCase();
  }
};

/** A címek, amelyek címében vagy nevében szerepel a keresett szöveg. */
export const searchStops = (stops: Stop[], text: string) => {
  const key = plain(text.trim());
  return key ? stops.filter((s) => plain(`${s.address} ${s.name}`).includes(key)) : [];
};
