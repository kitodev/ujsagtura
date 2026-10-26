// Napok kezelése helyi idő szerint, YYYY-MM-DD formában.

const pad = (n: number) => String(n).padStart(2, "0");
/** Dátum → YYYY-MM-DD (helyi idő; Intl nélkül, hogy a telefonos alkalmazásban is biztosan működjön). */
export const toISODay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** A mai nap. */
export const todayISO = () => toISODay(new Date());

/** Délben értelmezzük, hogy az óraátállítás ne csússzon át másik napra. */
const atNoon = (day: string) => new Date(`${day}T12:00:00`);

/** `day` + `n` nap. */
export function addDays(day: string, n: number): string {
  const d = atNoon(day);
  d.setDate(d.getDate() + n);
  return toISODay(d);
}

/** A hónap első napja. */
export const monthStart = (day: string) => `${day.slice(0, 8)}01`;

/** Napok száma két dátum között, mindkét végét beleszámolva. */
export const daysInclusive = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / 864e5) + 1;

/** „2026. október 24., szombat” */
export const formatLongHu = (day: string) =>
  atNoon(day).toLocaleDateString("hu-HU", { year: "numeric", month: "long", day: "numeric", weekday: "long" });

/** YYYY-MM-DD formátum ellenőrzése. */
export const isISODay = (s: string | null | undefined): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
