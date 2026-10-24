"use client";
// Térkép (MapLibre): forgatható és dönthető, így a navigáció a Google Mapshez hasonlóan „menetirány szerint felfelé”,
// döntött nézetben is mehet. A saját helyzet egy irányt mutató nyíl, ami simán csúszik az új GPS-pontra.
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState } from "react";

export type Pin = { id: string; n: number; lat: number; lon: number; cls: string; label: string };
type LL = { lat: number; lon: number; acc?: number };
type Props = {
  pins: Pin[];
  me: LL | null;              // a megjelenített saját helyzet (navigáció közben az útra illesztve)
  heading: number | null;     // menetirány fokban (0 = észak), null = nem ismert
  onPick: (id: string) => void;
  line: [number, number][] | null;   // [lat, lon] pontok
  cut?: { i: number; pt: [number, number] } | null; // navigáció közben: eddig megtett rész levágása
  follow: boolean;            // navigáció fut: kövesse a helyzetet
  drive: boolean;             // „vezetés” nézet: döntött, menetirány szerint forgatott
  full: boolean;              // teljes képernyő (csak a méretváltás miatt kell)
};

const STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: { osm: { type: "raster", tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"], tileSize: 256, maxzoom: 19, attribution: "© OpenStreetMap" } },
  layers: [{ id: "osm", type: "raster", source: "osm" }],
};
const EMPTY: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };
const lineFC = (pts: [number, number][]): GeoJSON.FeatureCollection =>
  pts.length < 2 ? EMPTY : { type: "FeatureCollection", features: [{ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: pts.map(([la, lo]) => [lo, la]) } }] };
function circle(c: LL, r: number): GeoJSON.FeatureCollection {
  const pts: number[][] = [];
  for (let k = 0; k <= 40; k++) {
    const a = (k / 40) * 2 * Math.PI;
    pts.push([c.lon + (r * Math.sin(a)) / (111320 * Math.cos((c.lat * Math.PI) / 180)), c.lat + (r * Math.cos(a)) / 110540]);
  }
  return { type: "FeatureCollection", features: [{ type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [pts] } }] };
}
// Címjelölők képe (szám egy színes körben). A jelölőket a térkép grafikus rétegként (WebGL) rajzolja, nem
// külön HTML-elemként: több száz HTML-jelölőt a térkép minden mozgáskor egyenként áthelyezett, ez teljes
// képernyőn és 3D nézetben lefagyasztotta a telefont.
const PIN_COLOR: Record<string, string> = { "": "#666666", d: "#2e7d32", h: "#8a6d00", n: "#e08a00" };
function pinImage(id: string) {
  const [, cls, n] = id.split("|");
  const r = 2, S = 28 * r, c = document.createElement("canvas");
  c.width = c.height = S;
  const g = c.getContext("2d")!;
  g.beginPath(); g.arc(S / 2, S / 2, S / 2 - r, 0, 2 * Math.PI);
  g.fillStyle = PIN_COLOR[cls] ?? PIN_COLOR[""]; g.fill();
  g.lineWidth = 2 * r; g.strokeStyle = "#fff"; g.stroke();
  g.fillStyle = "#fff"; g.textAlign = "center"; g.textBaseline = "middle";
  g.font = `bold ${(n.length > 2 ? 10 : 12) * r}px system-ui, sans-serif`;
  g.fillText(n, S / 2, S / 2 + r / 2);
  return { width: S, height: S, data: new Uint8Array(g.getImageData(0, 0, S, S).data.buffer) };
}

const ARROW = `<svg viewBox="0 0 40 40" width="40" height="40"><circle cx="20" cy="20" r="17" fill="#fff" opacity=".9"/><path d="M20 5 L31 32 L20 26 L9 32 Z" fill="#1a73e8" stroke="#fff" stroke-width="2.5" stroke-linejoin="round"/></svg>`;
const DOT = `<svg viewBox="0 0 40 40" width="40" height="40"><circle cx="20" cy="20" r="10" fill="#1a73e8" stroke="#fff" stroke-width="3.5"/></svg>`;

export default function Map({ pins, me, heading, onPick, line, cut, follow, drive, full }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [ready, setReady] = useState(false);
  const [free, setFree] = useState(false);        // a felhasználó elhúzta a térképet → nem követünk, „Középre” gomb
  const meMarker = useRef<maplibregl.Marker | null>(null);
  const meEl = useRef<HTMLDivElement | null>(null);
  const shown = useRef<LL | null>(null);          // a nyíl éppen kirajzolt helye (animációhoz)
  const anim = useRef(0);
  const pickRef = useRef(onPick); pickRef.current = onPick;
  const zoomRef = useRef<number | null>(null);    // a felhasználó által követés közben beállított nagyítás
  const track = (follow || drive) && !free;

  // --- létrehozás ---
  useEffect(() => {
    if (!box.current) return;
    const map = new maplibregl.Map({ container: box.current, style: STYLE, center: [19.485, 46.434], zoom: 14, maxPitch: 60, attributionControl: { compact: true },
      // telefonon a 3-szoros felbontás sokszor annyi rajzolást jelent, a 2-szeres is éles
      pixelRatio: Math.min(window.devicePixelRatio || 1, 2), fadeDuration: 0 });
    mapRef.current = map;
    map.on("load", () => {
      map.addSource("route", { type: "geojson", data: EMPTY });
      map.addSource("acc", { type: "geojson", data: EMPTY });
      map.addLayer({ id: "acc", type: "fill", source: "acc", paint: { "fill-color": "#1a73e8", "fill-opacity": 0.12 } });
      map.addLayer({ id: "route-casing", type: "line", source: "route", layout: { "line-join": "round", "line-cap": "round" }, paint: { "line-color": "#0b57d0", "line-width": ["interpolate", ["linear"], ["zoom"], 12, 5, 18, 14] } });
      map.addLayer({ id: "route", type: "line", source: "route", layout: { "line-join": "round", "line-cap": "round" }, paint: { "line-color": "#4b8ff7", "line-width": ["interpolate", ["linear"], ["zoom"], 12, 3, 18, 10] } });
      map.addSource("pins", { type: "geojson", data: EMPTY });
      map.addLayer({ id: "pins", type: "symbol", source: "pins", layout: {
        "icon-image": ["get", "icon"], "icon-allow-overlap": true, "icon-ignore-placement": true,
        "symbol-sort-key": ["get", "n"], "icon-pitch-alignment": "viewport" } });
      setReady(true);
    });
    const userMove = (e: { originalEvent?: unknown }) => { if (e.originalEvent) setFree(true); };
    map.on("dragstart", userMove);
    map.on("styleimagemissing", (e) => { if (e.id.startsWith("pin|") && !map.hasImage(e.id)) map.addImage(e.id, pinImage(e.id), { pixelRatio: 2 }); });
    map.on("click", "pins", (e) => { const id = e.features?.[0]?.properties?.id; if (id) pickRef.current(String(id)); });
    map.on("mouseenter", "pins", () => { map.getCanvas().style.cursor = "pointer"; });
    map.on("mouseleave", "pins", () => { map.getCanvas().style.cursor = ""; });
    map.on("zoomend", (e) => { if ((e as { originalEvent?: unknown }).originalEvent) zoomRef.current = map.getZoom(); });
    const el = document.createElement("div");
    el.className = "me-arrow";
    el.innerHTML = DOT;
    meEl.current = el;
    meMarker.current = new maplibregl.Marker({ element: el, rotationAlignment: "map", pitchAlignment: "map" });
    const ro = new ResizeObserver(() => map.resize());
    ro.observe(box.current);
    return () => { ro.disconnect(); cancelAnimationFrame(anim.current); map.remove(); mapRef.current = null; setReady(false); };
  }, []);

  // --- címek jelölői (csak akkor frissül, ha tényleg változott valami) ---
  const pinData = pins.map((p) => `${p.id}|${p.cls}|${p.n}|${p.lat},${p.lon}`).join(";");
  useEffect(() => {
    const src = ready ? (mapRef.current?.getSource("pins") as maplibregl.GeoJSONSource | undefined) : undefined;
    if (!src) return;
    src.setData({ type: "FeatureCollection", features: pins.map((p) => ({
      type: "Feature", properties: { id: p.id, n: p.n, icon: `pin|${p.cls}|${p.n}` },
      geometry: { type: "Point", coordinates: [p.lon, p.lat] } })) });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, pinData]);

  // --- igazítás a címekre / útvonalra (csak ha nem követjük a helyzetet) ---
  const fit = (pts: [number, number][]) => {
    const map = mapRef.current; if (!map || !pts.length) return;
    const b = new maplibregl.LngLatBounds();
    pts.forEach(([la, lo]) => b.extend([lo, la]));
    map.fitBounds(b, { padding: 40, maxZoom: 17, duration: 600, bearing: 0, pitch: 0 });
  };
  const pinKey = pins.map((p) => `${p.lat},${p.lon}`).join(";");
  useEffect(() => { if (!track && pins.length) fit(pins.map((p) => [p.lat, p.lon])); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pinKey]);
  useEffect(() => { if (!track && line?.length) fit(line); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [line]);

  // --- útvonal (navigáció közben csak a hátralévő rész) ---
  useEffect(() => {
    const src = ready ? (mapRef.current?.getSource("route") as maplibregl.GeoJSONSource | undefined) : undefined;
    if (!src) return;
    const pts = line ?? [];
    src.setData(lineFC(cut ? [cut.pt, ...pts.slice(cut.i + 1)] : pts));
  }, [ready, line, cut]);

  // --- saját helyzet: nyíl + pontossági kör, sima mozgatás ---
  // Csak számokra figyelünk (nem az objektumra), így a felesleges újrarajzolások elmaradnak.
  const lat = me?.lat ?? null, lon = me?.lon ?? null, acc = me?.acc ?? 0;
  useEffect(() => {
    const el = meEl.current, mk = meMarker.current;
    if (!el || !mk) return;
    const kind = heading == null ? "dot" : "arrow";
    if (el.dataset.kind !== kind) { el.dataset.kind = kind; el.innerHTML = kind === "dot" ? DOT : ARROW; }
    if (heading != null) mk.setRotation(heading);
  }, [heading]);
  useEffect(() => {
    const map = mapRef.current, mk = meMarker.current;
    if (!map || !mk) return;
    if (lat == null || lon == null) { mk.remove(); shown.current = null; return; }
    if (!shown.current) { shown.current = { lat, lon }; mk.setLngLat([lon, lat]).addTo(map); }
    const from = shown.current, to = { lat, lon }, t0 = performance.now(), D = 900;
    cancelAnimationFrame(anim.current);
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / D);
      const p = { lat: from.lat + (to.lat - from.lat) * k, lon: from.lon + (to.lon - from.lon) * k };
      shown.current = p; mk.setLngLat([p.lon, p.lat]);
      if (k < 1) anim.current = requestAnimationFrame(step);
    };
    anim.current = requestAnimationFrame(step);
  }, [lat, lon]);
  useEffect(() => {
    const src = ready ? (mapRef.current?.getSource("acc") as maplibregl.GeoJSONSource | undefined) : undefined;
    src?.setData(lat != null && lon != null && acc > 8 && !drive ? circle({ lat, lon }, acc) : EMPTY);
  }, [lat, lon, acc, ready, drive]);

  // --- kamera követés ---
  // Csak akkor mozdítjuk a kamerát, ha legalább 1 métert mentünk vagy 3 fokot fordultunk:
  // az iránytű apró rezgései ne indítsanak folyamatos újrarajzolást.
  const lastCam = useRef<{ lat: number; lon: number; h: number | null; mode: string } | null>(null);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !track || lat == null || lon == null) { lastCam.current = null; return; }
    const mode = `${drive}|${zoomRef.current}`, L = lastCam.current;
    const moved = L ? Math.hypot((lat - L.lat) * 110540, (lon - L.lon) * 111320 * Math.cos((lat * Math.PI) / 180)) : Infinity;
    const turned = L && heading != null && L.h != null ? Math.abs(((heading - L.h + 540) % 360) - 180) : Infinity;
    if (L && L.mode === mode && moved < 1 && (!drive || turned < 3)) return;
    lastCam.current = { lat, lon, h: heading, mode };
    const h = map.getContainer().clientHeight;
    const z = zoomRef.current ?? (drive ? 17.5 : 16.5);
    map.easeTo({
      center: [lon, lat],
      zoom: z,
      bearing: drive ? (heading ?? map.getBearing()) : 0,
      pitch: drive ? 50 : 0,
      padding: drive ? { top: Math.round(h * 0.45), bottom: 0, left: 0, right: 0 } : { top: 0, bottom: 0, left: 0, right: 0 },
      duration: 900, easing: (t) => t, essential: true,
    });
  }, [lat, lon, heading, track, drive]);

  // nézetváltáskor alapértelmezett nagyítás; vezetés nézetből kilépve vissza északra és laposra
  useEffect(() => {
    zoomRef.current = null;
    const map = mapRef.current;
    if (!drive && map) map.easeTo({ bearing: 0, pitch: 0, padding: { top: 0, bottom: 0, left: 0, right: 0 }, duration: 600 });
  }, [drive]);
  useEffect(() => { if (!follow && !drive) setFree(false); }, [follow, drive]);
  useEffect(() => { mapRef.current?.resize(); }, [full]);

  return (
    <div className={`mapbox${full ? " full" : ""}`}>
      <div ref={box} style={{ position: "absolute", inset: 0 }} />
      {(follow || drive) && free && me && (
        <button className="recenter" onClick={() => { setFree(false); zoomRef.current = null; }}>◎ Középre</button>
      )}
    </div>
  );
}
