// A térképen megjelenő HTML-elemek (saját helyzet nyila, kiemelés, címablak).
import { STATUS_LABEL } from "@/lib/deliveries";
import type { Status } from "@/lib/types";

export const ARROW_SVG =
  '<svg viewBox="0 0 40 40" width="40" height="40"><circle cx="20" cy="20" r="17" fill="#fff" opacity=".9"/>' +
  '<path d="M20 5 L31 32 L20 26 L9 32 Z" fill="#1a73e8" stroke="#fff" stroke-width="2.5" stroke-linejoin="round"/></svg>';
export const DOT_SVG =
  '<svg viewBox="0 0 40 40" width="40" height="40"><circle cx="20" cy="20" r="10" fill="#1a73e8" stroke="#fff" stroke-width="3.5"/></svg>';

/** Egy cím adatai a kis ablakhoz. */
export type PinInfo = {
  id: string;
  lat: number;
  lon: number;
  title: string;
  sub: string;
  note: string;
  papers: { name: string; status?: Status }[];
};

function el<K extends keyof HTMLElementTagNameMap>(parent: HTMLElement | null, tag: K, cls = "", text = "") {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  parent?.appendChild(e);
  return e;
}

/** A saját helyzet jelölője: pont (ha nem ismert az irány) vagy nyíl. */
export function createMeElement() {
  const e = el(null, "div", "me-arrow");
  e.innerHTML = DOT_SVG;
  return e;
}

export function setMeShape(e: HTMLElement, arrow: boolean) {
  const kind = arrow ? "arrow" : "dot";
  if (e.dataset.kind === kind) return;
  e.dataset.kind = kind;
  e.innerHTML = arrow ? ARROW_SVG : DOT_SVG;
}

/** Lüktető kör a kiemelt cím körül. A lüktetés belső elemen fut, mert a külsőt a térkép mozgatja. */
export function createFocusRing() {
  const outer = el(null, "div");
  outer.style.pointerEvents = "none";
  el(outer, "div", "focus-ring");
  return outer;
}

export function createFocusLabel(text: string) {
  return el(null, "div", "focus-lab", text);
}

/** A címablak tartalma: cím, név, megjegyzés, újságok, „ugrás a listához” gomb. */
export function createInfoContent(info: PinInfo, onGo: () => void) {
  const box = el(null, "div", "pin-info");
  el(box, "b", "", info.title);
  if (info.sub) el(box, "div", "pi-sub", info.sub);
  if (info.note) el(box, "div", "pi-note", `⚠ ${info.note}`);
  const list = el(box, "div", "pi-pap");
  for (const p of info.papers) {
    el(list, "span", `pi-chip ${p.status ?? "todo"}`, p.status ? `${p.name} · ${STATUS_LABEL[p.status]}` : p.name);
  }
  const go = el(box, "button", "pi-go", "Ugrás a címhez a listában ›");
  go.onclick = onGo;
  el(box, "div", "pi-hint", "(vagy koppints még egyszer a címre)");
  return box;
}
