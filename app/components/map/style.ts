// A térkép stílusa (OpenStreetMap csempék) és rétegei.
import type maplibregl from "maplibre-gl";
import { circlePolygon, type LatLon } from "@/lib/geo";

export const KISKUNHALAS: [number, number] = [19.485, 46.434];

export const MAP_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: "raster",
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      maxzoom: 19,
      attribution: "© OpenStreetMap",
    },
  },
  layers: [{ id: "osm", type: "raster", source: "osm" }],
};

export const SOURCE = { route: "route", accuracy: "acc", pins: "pins" } as const;
export const PIN_LAYER = "pins";

export const EMPTY: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };

const widthByZoom = (low: number, high: number): maplibregl.ExpressionSpecification => [
  "interpolate",
  ["linear"],
  ["zoom"],
  12,
  low,
  18,
  high,
];

/** Források és rétegek felvétele a betöltött térképre. */
export function addLayers(map: maplibregl.Map) {
  map.addSource(SOURCE.route, { type: "geojson", data: EMPTY });
  map.addSource(SOURCE.accuracy, { type: "geojson", data: EMPTY });
  map.addSource(SOURCE.pins, { type: "geojson", data: EMPTY });

  map.addLayer({
    id: "acc",
    type: "fill",
    source: SOURCE.accuracy,
    paint: { "fill-color": "#1a73e8", "fill-opacity": 0.12 },
  });
  const round = { "line-join": "round", "line-cap": "round" } as const;
  map.addLayer({
    id: "route-casing",
    type: "line",
    source: SOURCE.route,
    layout: round,
    paint: { "line-color": "#0b57d0", "line-width": widthByZoom(5, 14) },
  });
  map.addLayer({
    id: "route",
    type: "line",
    source: SOURCE.route,
    layout: round,
    paint: { "line-color": "#4b8ff7", "line-width": widthByZoom(3, 10) },
  });
  map.addLayer({
    id: PIN_LAYER,
    type: "symbol",
    source: SOURCE.pins,
    layout: {
      "icon-image": ["get", "icon"],
      "icon-allow-overlap": true,
      "icon-ignore-placement": true,
      "symbol-sort-key": ["get", "n"],
      "icon-pitch-alignment": "viewport",
    },
  });
}

/** Vonal [lat, lon] pontokból. */
export function lineFeature(pts: [number, number][]): GeoJSON.FeatureCollection {
  if (pts.length < 2) return EMPTY;
  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: {},
        geometry: { type: "LineString", coordinates: pts.map(([la, lo]) => [lo, la]) },
      },
    ],
  };
}

/** A GPS pontosságát jelző kör. */
export function accuracyFeature(center: LatLon, radiusM: number): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: [
      { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [circlePolygon(center, radiusM)] } },
    ],
  };
}

export const NO_PADDING = { top: 0, bottom: 0, left: 0, right: 0 };
