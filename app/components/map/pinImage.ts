// Címjelölők képe (szám egy színes körben).
// A jelölőket a térkép grafikus rétegként (WebGL) rajzolja, nem külön HTML-elemként: több száz HTML-jelölőt
// a térkép minden mozgáskor egyenként áthelyezett, ez teljes képernyőn és 3D nézetben lefagyasztotta a telefont.
import type { Pin } from "@/lib/pins";

const COLOR: Record<Pin["cls"], string> = { "": "#666666", d: "#2e7d32", h: "#8a6d00", n: "#e08a00" };
const SCALE = 2;
const SIZE = 28 * SCALE;

/** A kép azonosítója: „pin|<cls>|<szöveg>”. */
export const pinImageId = (p: Pin) => `pin|${p.cls}|${p.t ?? p.n}`;
export const isPinImageId = (id: string) => id.startsWith("pin|");

/** A kép kirajzolása az azonosítóból (a térkép kéri, amikor először kell). */
export function drawPinImage(id: string) {
  const [, cls, text] = id.split("|");
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = SIZE;
  const g = canvas.getContext("2d")!;
  g.beginPath();
  g.arc(SIZE / 2, SIZE / 2, SIZE / 2 - SCALE, 0, 2 * Math.PI);
  g.fillStyle = COLOR[cls as Pin["cls"]] ?? COLOR[""];
  g.fill();
  g.lineWidth = 2 * SCALE;
  g.strokeStyle = "#fff";
  g.stroke();
  g.fillStyle = "#fff";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.font = `bold ${(text.length > 2 ? 10 : 12) * SCALE}px system-ui, sans-serif`;
  g.fillText(text, SIZE / 2, SIZE / 2 + SCALE / 2);
  return { width: SIZE, height: SIZE, data: new Uint8Array(g.getImageData(0, 0, SIZE, SIZE).data.buffer) };
}

export const PIN_PIXEL_RATIO = SCALE;
