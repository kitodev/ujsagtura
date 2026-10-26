// Idő és dátum kiírása magyarul (Intl nélkül, hogy minden telefonon ugyanígy működjön).
const MONTHS = [
  "január",
  "február",
  "március",
  "április",
  "május",
  "június",
  "július",
  "augusztus",
  "szeptember",
  "október",
  "november",
  "december",
];
const WEEKDAYS = ["vasárnap", "hétfő", "kedd", "szerda", "csütörtök", "péntek", "szombat"];
const pad = (n: number) => String(n).padStart(2, "0");

/** „14:05” */
export const clockHu = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

/** „2026. október 24., szombat” */
export function longDayHu(day: string): string {
  const d = new Date(`${day}T12:00:00`);
  return `${d.getFullYear()}. ${MONTHS[d.getMonth()]} ${d.getDate()}., ${WEEKDAYS[d.getDay()]}`;
}

/** „okt. 24., szo” – rövid forma a napválasztóhoz. */
export function shortDayHu(day: string): string {
  const d = new Date(`${day}T12:00:00`);
  return `${MONTHS[d.getMonth()].slice(0, 3)}. ${d.getDate()}., ${WEEKDAYS[d.getDay()].slice(0, 3)}`;
}
