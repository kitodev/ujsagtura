// Színek (ugyanazok, mint a webes változatban).
export const C = {
  bg: "#f4f1ea",
  card: "#ffffff",
  tx: "#1d1d1b",
  mu: "#6b675e",
  bd: "#ddd8cc",
  ok: "#2e7d32",
  mi: "#e08a00",
  ca: "#c62828",
  ac: "#1f4e79",
  half: "#8a6d00",
  dark: "#1d1d1b",
} as const;

export const STATUS_COLOR = { delivered: C.ok, missing: C.mi, cancelled: C.ca } as const;
