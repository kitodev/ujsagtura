"use client";
// Térkép (MapLibre): forgatható és dönthető, így a navigáció a Google Mapshez hasonlóan „menetirány szerint felfelé”,
// döntött nézetben is mehet. A saját helyzet egy irányt mutató nyíl, ami simán csúszik az új GPS-pontra.
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState, type MutableRefObject } from "react";
import { angleDiff, metersPerDegree, type LatLon } from "@/lib/geo";
import type { Pin } from "@/lib/pins";
import {
  createFocusLabel,
  createFocusRing,
  createInfoContent,
  createMeElement,
  setMeShape,
  type PinInfo,
} from "./map/dom";
import { drawPinImage, isPinImageId, PIN_PIXEL_RATIO, pinImageId } from "./map/pinImage";
import {
  accuracyFeature,
  addLayers,
  EMPTY,
  KISKUNHALAS,
  lineFeature,
  MAP_STYLE,
  NO_PADDING,
  PIN_LAYER,
  SOURCE,
} from "./map/style";

export type { PinInfo } from "./map/dom";
export type MapFocus = { lat: number; lon: number; label: string; k: number };

type Props = {
  pins: Pin[];
  /** A megjelenített saját helyzet (navigáció közben az útra illesztve). */
  me: (LatLon & { acc?: number }) | null;
  /** Menetirány fokban (0 = észak), null = nem ismert. */
  heading: number | null;
  onPick: (id: string) => void;
  /** Útvonal [lat, lon] pontokkal. */
  line: [number, number][] | null;
  /** Navigáció közben: az eddig megtett rész levágása. */
  cut?: { i: number; pt: [number, number] } | null;
  /** Navigáció fut: a térkép kövesse a helyzetet. */
  follow: boolean;
  /** „Vezetés” nézet: döntött, menetirány szerint forgatott. */
  drive: boolean;
  /** Teljes képernyő (a méretváltás miatt kell). */
  full: boolean;
  /** A listában rábökött cím: odarepül és kiemeli. */
  focus?: MapFocus | null;
  /** Egy koppintás a címre: kis ablak a címmel és az újságokkal. */
  info?: PinInfo | null;
  onInfoClose?: () => void;
};

const DRIVE_PITCH = 50;
const DRIVE_ZOOM = 17.5;
const FOLLOW_ZOOM = 16.5;
const CAMERA_MS = 900;

const source = (map: maplibregl.Map | null, id: string) => map?.getSource(id) as maplibregl.GeoJSONSource | undefined;

export default function MapView(props: Props) {
  const { pins, me, heading, line, cut, follow, drive, full, focus, info } = props;
  const container = useRef<HTMLDivElement>(null);
  const pickRef = useRef(props.onPick);
  pickRef.current = props.onPick;
  const closeInfoRef = useRef(props.onInfoClose);
  closeInfoRef.current = props.onInfoClose;

  /** A felhasználó elhúzta a térképet → nem követünk, „Középre” gomb. */
  const [free, setFree] = useState(false);
  /** A felhasználó által követés közben beállított nagyítás. */
  const userZoom = useRef<number | null>(null);
  const track = (follow || drive) && !free;

  const { map, ready, meMarker, meElement } = useMapInstance(container, pickRef, setFree, userZoom);

  usePins(map, ready, pins);
  useAutoFit(map, pins, line, !track && !focus);
  useRouteLine(map, ready, line, cut);
  useFocus(map, ready, focus, () => (follow || drive) && setFree(true));
  useInfoPopup(map, ready, info, track, pickRef, closeInfoRef);
  useMeMarker(map, ready, meMarker, meElement, me, heading, drive);
  useCamera(map, me, heading, track, drive, userZoom);

  // nézetváltáskor alapértelmezett nagyítás; vezetés nézetből kilépve vissza északra és laposra
  useEffect(() => {
    userZoom.current = null;
    if (!drive) map.current?.easeTo({ bearing: 0, pitch: 0, padding: NO_PADDING, duration: 600 });
  }, [drive, map]);
  useEffect(() => {
    if (!follow && !drive) setFree(false);
  }, [follow, drive]);
  useEffect(() => {
    map.current?.resize();
  }, [full, map]);

  return (
    <div className={`mapbox${full ? " full" : ""}`}>
      <div ref={container} style={{ position: "absolute", inset: 0 }} />
      {(follow || drive) && free && me && (
        <button
          className="recenter"
          onClick={() => {
            setFree(false);
            userZoom.current = null;
          }}
        >
          ◎ Középre
        </button>
      )}
    </div>
  );
}

// ——— A térkép létrehozása ———

function useMapInstance(
  container: React.RefObject<HTMLDivElement | null>,
  pickRef: MutableRefObject<(id: string) => void>,
  setFree: (v: boolean) => void,
  userZoom: MutableRefObject<number | null>,
) {
  const map = useRef<maplibregl.Map | null>(null);
  const meMarker = useRef<maplibregl.Marker | null>(null);
  const meElement = useRef<HTMLDivElement | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!container.current) return;
    const m = new maplibregl.Map({
      container: container.current,
      style: MAP_STYLE,
      center: KISKUNHALAS,
      zoom: 14,
      maxPitch: 60,
      attributionControl: { compact: true },
      // telefonon a 3-szoros felbontás sokszor annyi rajzolást jelent, a 2-szeres is éles
      pixelRatio: Math.min(window.devicePixelRatio || 1, 2),
      fadeDuration: 0,
    });
    map.current = m;
    // a végponttól végpontig tartó tesztek innen tudják, hol van egy cím a képernyőn
    if (process.env.NODE_ENV !== "production") (window as unknown as { __map?: maplibregl.Map }).__map = m;

    m.on("load", () => {
      addLayers(m);
      setReady(true);
    });
    m.on("styleimagemissing", (e) => {
      if (isPinImageId(e.id) && !m.hasImage(e.id))
        m.addImage(e.id, drawPinImage(e.id), { pixelRatio: PIN_PIXEL_RATIO });
    });
    m.on("click", PIN_LAYER, (e) => {
      const id = e.features?.[0]?.properties?.id;
      if (id) pickRef.current(String(id));
    });
    // dupla koppintás a címre ne nagyítson (a második koppintás a listához visz)
    m.on("dblclick", PIN_LAYER, (e) => e.preventDefault());
    m.on("mouseenter", PIN_LAYER, () => (m.getCanvas().style.cursor = "pointer"));
    m.on("mouseleave", PIN_LAYER, () => (m.getCanvas().style.cursor = ""));
    m.on("dragstart", (e) => e.originalEvent && setFree(true));
    m.on("zoomend", (e) => {
      if ((e as { originalEvent?: unknown }).originalEvent) userZoom.current = m.getZoom();
    });

    const el = createMeElement();
    meElement.current = el;
    meMarker.current = new maplibregl.Marker({ element: el, rotationAlignment: "map", pitchAlignment: "map" });

    const resize = new ResizeObserver(() => m.resize());
    resize.observe(container.current);
    return () => {
      resize.disconnect();
      m.remove();
      map.current = null;
      setReady(false);
    };
  }, [container, pickRef, setFree, userZoom]);

  return { map, ready, meMarker, meElement };
}

// ——— Címjelölők ———

function usePins(map: MutableRefObject<maplibregl.Map | null>, ready: boolean, pins: Pin[]) {
  // csak akkor frissül, ha tényleg változott valami
  const key = pins.map((p) => `${pinImageId(p)}|${p.id}|${p.lat},${p.lon}`).join(";");
  useEffect(() => {
    if (!ready) return;
    source(map.current, SOURCE.pins)?.setData({
      type: "FeatureCollection",
      features: pins.map((p) => ({
        type: "Feature",
        properties: { id: p.id, n: p.n, icon: pinImageId(p) },
        geometry: { type: "Point", coordinates: [p.lon, p.lat] },
      })),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- a `key` pontosan leírja a változást
  }, [ready, key]);
}

/** Igazítás a címekre / útvonalra – csak ha nem követjük a helyzetet és nincs kiemelt cím. */
function useAutoFit(
  map: MutableRefObject<maplibregl.Map | null>,
  pins: Pin[],
  line: [number, number][] | null,
  enabled: boolean,
) {
  const fit = (pts: [number, number][]) => {
    if (!map.current || !pts.length) return;
    const bounds = new maplibregl.LngLatBounds();
    pts.forEach(([la, lo]) => bounds.extend([lo, la]));
    map.current.fitBounds(bounds, { padding: 40, maxZoom: 17, duration: 600, bearing: 0, pitch: 0 });
  };
  const pinKey = pins.map((p) => `${p.lat},${p.lon}`).join(";");
  useEffect(() => {
    if (enabled && pins.length) fit(pins.map((p) => [p.lat, p.lon]));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- csak a pontok változásakor
  }, [pinKey]);
  useEffect(() => {
    if (enabled && line?.length) fit(line);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- csak új útvonalnál
  }, [line]);
}

// ——— Útvonal ———

function useRouteLine(
  map: MutableRefObject<maplibregl.Map | null>,
  ready: boolean,
  line: [number, number][] | null,
  cut: Props["cut"],
) {
  useEffect(() => {
    if (!ready) return;
    const pts = line ?? [];
    // navigáció közben csak a hátralévő rész
    source(map.current, SOURCE.route)?.setData(lineFeature(cut ? [cut.pt, ...pts.slice(cut.i + 1)] : pts));
  }, [map, ready, line, cut]);
}

// ——— Kiemelt cím (a listából) ———

function useFocus(
  map: MutableRefObject<maplibregl.Map | null>,
  ready: boolean,
  focus: MapFocus | null | undefined,
  onFocus: () => void,
) {
  const marker = useRef<maplibregl.Marker | null>(null);
  const label = useRef<maplibregl.Popup | null>(null);
  useEffect(() => {
    marker.current?.remove();
    label.current?.remove();
    marker.current = label.current = null;
    const m = map.current;
    if (!m || !ready || !focus) return;
    onFocus(); // követés közben is odaugrik; a „Középre” gombbal vissza
    const at: [number, number] = [focus.lon, focus.lat];
    m.flyTo({ center: at, zoom: Math.max(m.getZoom(), 17), bearing: 0, pitch: 0, padding: NO_PADDING, duration: 900 });
    marker.current = new maplibregl.Marker({ element: createFocusRing() }).setLngLat(at).addTo(m);
    label.current = new maplibregl.Popup({
      closeButton: false,
      closeOnClick: false,
      offset: 22,
      anchor: "bottom",
      className: "focus-pop",
    })
      .setLngLat(at)
      .setDOMContent(createFocusLabel(focus.label))
      .addTo(m);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- új kiemelésnél (k) fut
  }, [focus?.k, ready]);
}

// ——— Címablak (egy koppintás a címre) ———

function useInfoPopup(
  map: MutableRefObject<maplibregl.Map | null>,
  ready: boolean,
  info: PinInfo | null | undefined,
  tracking: boolean,
  pickRef: MutableRefObject<(id: string) => void>,
  closeRef: MutableRefObject<(() => void) | undefined>,
) {
  const popup = useRef<maplibregl.Popup | null>(null);
  const key = info ? JSON.stringify(info) : "";

  useEffect(() => {
    const m = map.current;
    if (!m || !ready || !info) {
      popup.current?.remove();
      popup.current = null;
      return;
    }
    if (!popup.current) {
      popup.current = new maplibregl.Popup({
        closeButton: true,
        closeOnClick: false,
        offset: 18,
        maxWidth: "260px",
        className: "pin-pop",
        anchor: "bottom",
      });
      popup.current.on("close", () => {
        popup.current = null;
        closeRef.current?.();
      });
    }
    const p = popup.current;
    p.setLngLat([info.lon, info.lat]).setDOMContent(createInfoContent(info, () => pickRef.current(info.id)));
    if (p.isOpen()) return;
    p.addTo(m);
    // A címet a térkép alsó részére toljuk, hogy a fölötte nyíló ablak ne lógjon le a kis térképről.
    // Kis késleltetéssel, hogy egy gyors dupla koppintás második fele még a címet érje.
    if (!tracking) {
      setTimeout(() => {
        if (popup.current !== p || !p.isOpen()) return;
        const offsetY = Math.round(m.getContainer().clientHeight * 0.3);
        m.easeTo({ center: [info.lon, info.lat], offset: [0, offsetY], duration: 400 });
      }, 450);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- a `key` pontosan leírja a változást
  }, [key, ready]);

  // a térkép üres részére kattintva bezárul
  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    const closeOnEmpty = (e: maplibregl.MapMouseEvent) => {
      if (!m.queryRenderedFeatures(e.point, { layers: [PIN_LAYER] }).length) popup.current?.remove();
    };
    m.on("click", closeOnEmpty);
    return () => {
      m.off("click", closeOnEmpty);
    };
  }, [map, ready]);
}

// ——— Saját helyzet ———

const GLIDE_MS = 900;

function useMeMarker(
  map: MutableRefObject<maplibregl.Map | null>,
  ready: boolean,
  marker: MutableRefObject<maplibregl.Marker | null>,
  element: MutableRefObject<HTMLDivElement | null>,
  me: Props["me"],
  heading: number | null,
  drive: boolean,
) {
  const shown = useRef<LatLon | null>(null); // a nyíl éppen kirajzolt helye (animációhoz)
  const frame = useRef(0);
  // Csak számokra figyelünk (nem az objektumra), így a felesleges újrarajzolások elmaradnak.
  const lat = me?.lat ?? null;
  const lon = me?.lon ?? null;
  const acc = me?.acc ?? 0;

  useEffect(() => {
    if (!element.current || !marker.current) return;
    setMeShape(element.current, heading != null);
    if (heading != null) marker.current.setRotation(heading);
  }, [element, marker, heading]);

  // sima csúszás az új helyre
  useEffect(() => {
    const m = map.current;
    const mk = marker.current;
    if (!m || !mk) return;
    if (lat == null || lon == null) {
      mk.remove();
      shown.current = null;
      return;
    }
    if (!shown.current) {
      shown.current = { lat, lon };
      mk.setLngLat([lon, lat]).addTo(m);
    }
    const from = shown.current;
    const start = performance.now();
    cancelAnimationFrame(frame.current);
    const step = (t: number) => {
      const k = Math.min(1, (t - start) / GLIDE_MS);
      const p = { lat: from.lat + (lat - from.lat) * k, lon: from.lon + (lon - from.lon) * k };
      shown.current = p;
      mk.setLngLat([p.lon, p.lat]);
      if (k < 1) frame.current = requestAnimationFrame(step);
    };
    frame.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame.current);
  }, [map, marker, lat, lon]);

  // pontossági kör
  useEffect(() => {
    if (!ready) return;
    const show = lat != null && lon != null && acc > 8 && !drive;
    source(map.current, SOURCE.accuracy)?.setData(show ? accuracyFeature({ lat, lon }, acc) : EMPTY);
  }, [map, ready, lat, lon, acc, drive]);
}

// ——— Kamera követés ———

function useCamera(
  map: MutableRefObject<maplibregl.Map | null>,
  me: Props["me"],
  heading: number | null,
  track: boolean,
  drive: boolean,
  userZoom: MutableRefObject<number | null>,
) {
  const last = useRef<{ lat: number; lon: number; h: number | null; mode: string } | null>(null);
  const lat = me?.lat ?? null;
  const lon = me?.lon ?? null;

  useEffect(() => {
    const m = map.current;
    if (!m || !track || lat == null || lon == null) {
      last.current = null;
      return;
    }
    // Csak akkor mozdítjuk a kamerát, ha legalább 1 métert mentünk vagy 3 fokot fordultunk:
    // az iránytű apró rezgései ne indítsanak folyamatos újrarajzolást.
    const mode = `${drive}|${userZoom.current}`;
    const prev = last.current;
    if (prev && prev.mode === mode) {
      const k = metersPerDegree(lat);
      const moved = Math.hypot((lat - prev.lat) * k.y, (lon - prev.lon) * k.x);
      const turned = heading != null && prev.h != null ? angleDiff(heading, prev.h) : Infinity;
      if (moved < 1 && (!drive || turned < 3)) return;
    }
    last.current = { lat, lon, h: heading, mode };
    const height = m.getContainer().clientHeight;
    m.easeTo({
      center: [lon, lat],
      zoom: userZoom.current ?? (drive ? DRIVE_ZOOM : FOLLOW_ZOOM),
      bearing: drive ? (heading ?? m.getBearing()) : 0,
      pitch: drive ? DRIVE_PITCH : 0,
      padding: drive ? { ...NO_PADDING, top: Math.round(height * 0.45) } : NO_PADDING,
      duration: CAMERA_MS,
      easing: (t) => t,
      essential: true,
    });
  }, [map, lat, lon, heading, track, drive, userZoom]);
}
