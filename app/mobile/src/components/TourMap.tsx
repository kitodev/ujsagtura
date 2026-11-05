// A térkép (MapLibre – ugyanaz a térképmotor, mint a weben, Google-kulcs nélkül): OpenStreetMap-részletek
// (a megnézetteket megőrzi, internet nélkül onnan rajzol), címjelölők, útvonal, saját helyzet iránynyíllal,
// navigáció közben követő (és „3D”, menetirányba forgatott) kamera.
// A jelölőket a térkép saját rétegként rajzolja (nem külön nézetekként), így több száz cím mellett is gyors.
import {
  Camera,
  GeoJSONSource,
  Images,
  Layer,
  Map,
  type CameraRef,
  type StyleSpecification,
} from "@maplibre/maplibre-react-native";
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import type { LatLon } from "@shared/geo";
import type { Pin } from "@shared/pins";
import { baseStyle, FONT, prepareGlyphs } from "@/lib/map-style";
import { C } from "@/theme";

const KISKUNHALAS: [number, number] = [19.4847, 46.4336];
const PADDING = { top: 60, right: 50, bottom: 60, left: 50 };
const FOLLOW_MS = 700;

export type MapFocus = LatLon & { label: string; k: number };
export type TourMapHandle = { center: (p: LatLon) => void };

type Props = {
  pins: Pin[];
  /** A pinek, amelyekre induláskor / túraváltáskor ráközelít. */
  fitIds: string[];
  me: (LatLon & { acc?: number }) | null;
  heading: number | null;
  line: [number, number][] | null;
  /** Navigáció közben a már megtett rész vége (szürke). */
  cut: { i: number; pt: [number, number] } | null;
  follow: boolean;
  drive: boolean;
  focus: MapFocus | null;
  onPick: (id: string) => void;
  onMapPress: () => void;
  /** A térkép érintése (közben a lista ne görögjön). */
  onTouching?: (touching: boolean) => void;
};

type Feature = GeoJSON.Feature<GeoJSON.Geometry, Record<string, unknown>>;
const collection = (features: Feature[]): GeoJSON.FeatureCollection => ({ type: "FeatureCollection", features });
const point = (p: LatLon, properties: Record<string, unknown> = {}): Feature => ({
  type: "Feature",
  properties,
  geometry: { type: "Point", coordinates: [p.lon, p.lat] },
});
const lineOf = (coords: [number, number][]): Feature => ({
  type: "Feature",
  properties: {},
  geometry: { type: "LineString", coordinates: coords.map(([lat, lon]) => [lon, lat]) },
});

/** Jelölő színe (cls: "" = jelöletlen, d = kész, h = részben, n = következő). */
const PIN_COLOR = ["match", ["get", "c"], "d", C.ok, "h", C.half, "n", C.mi, "#666666"];
/** A következő cím legfelül, a kész címek legalul. */
const PIN_ORDER = ["match", ["get", "c"], "n", 3, "d", 1, 2];

export const TourMap = forwardRef<TourMapHandle, Props>(function TourMap(p, ref) {
  const camera = useRef<CameraRef>(null);
  const [ready, setReady] = useState(false);
  const [glyphs, setGlyphs] = useState<string | null>(null);
  const fitted = useRef("");

  useEffect(() => {
    prepareGlyphs()
      .then(setGlyphs)
      .catch(() => setGlyphs("")); // számok nélkül is működik
  }, []);
  const style = useMemo<StyleSpecification | null>(() => {
    if (glyphs == null) return null;
    const s = baseStyle(glyphs);
    if (!glyphs) delete s.glyphs;
    return s;
  }, [glyphs]);

  useImperativeHandle(ref, () => ({
    center: (pt) => camera.current?.easeTo({ center: [pt.lon, pt.lat], zoom: 17, duration: 500 }),
  }));

  // ráközelítés a túra címeire (induláskor és túraváltáskor), ha nem navigálunk
  const fitKey = p.fitIds.join(",");
  useEffect(() => {
    if (!ready || p.follow || !fitKey || fitted.current === fitKey) return;
    const ids = new Set(p.fitIds);
    const pts = p.pins.filter((x) => ids.has(x.id));
    if (!pts.length) return;
    fitted.current = fitKey;
    if (pts.length === 1) {
      camera.current?.easeTo({ center: [pts[0].lon, pts[0].lat], zoom: 16, duration: 600 });
      return;
    }
    const lons = pts.map((x) => x.lon);
    const lats = pts.map((x) => x.lat);
    camera.current?.fitBounds([Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)], {
      padding: PADDING,
      duration: 600,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- a `fitKey` írja le a változást
  }, [ready, fitKey, p.pins.length, p.follow]);

  // a listában kiválasztott cím megmutatása
  useEffect(() => {
    if (ready && p.focus) camera.current?.easeTo({ center: [p.focus.lon, p.focus.lat], zoom: 17, duration: 500 });
  }, [ready, p.focus]);

  // navigáció: a kamera követi a helyzetet; „3D” módban menetirányba fordít és megdönti a térképet
  const lastFollow = useRef(0);
  useEffect(() => {
    if (!ready || !p.follow || !p.me) return;
    const now = Date.now();
    if (now - lastFollow.current < FOLLOW_MS / 2) return;
    lastFollow.current = now;
    camera.current?.easeTo({
      center: [p.me.lon, p.me.lat],
      bearing: p.drive ? (p.heading ?? 0) : 0,
      pitch: p.drive ? 55 : 0,
      zoom: p.drive ? 18 : 17,
      duration: FOLLOW_MS,
    });
  }, [ready, p.follow, p.drive, p.me, p.heading]);
  // a navigáció végén vissza felülnézetbe
  useEffect(() => {
    if (ready && !p.follow) void camera.current?.setStop({ bearing: 0, pitch: 0, duration: 400 });
  }, [ready, p.follow]);

  const pinData = useMemo(
    () => collection(p.pins.map((x) => point(x, { id: x.id, c: x.cls, t: x.t ?? String(x.n) }))),
    [p.pins],
  );
  const [done, rest] = useMemo(() => {
    if (!p.line || p.line.length < 2) return [null, null];
    if (!p.cut) return [null, collection([lineOf(p.line)])];
    const before = [...p.line.slice(0, p.cut.i + 1), p.cut.pt];
    const after = [p.cut.pt, ...p.line.slice(p.cut.i + 1)];
    return [collection([lineOf(before)]), after.length > 1 ? collection([lineOf(after)]) : null];
  }, [p.line, p.cut]);
  const meData = useMemo(
    () => (p.me ? collection([point(p.me, { h: p.heading ?? 0, dir: p.heading != null })]) : null),
    [p.me, p.heading],
  );
  const focusData = useMemo(() => (p.focus ? collection([point(p.focus)]) : null), [p.focus]);

  if (!style) return <View style={[StyleSheet.absoluteFill, { backgroundColor: "#f2efe9" }]} />;

  return (
    <View
      style={StyleSheet.absoluteFill}
      onTouchStart={() => p.onTouching?.(true)}
      onTouchEnd={() => p.onTouching?.(false)}
      onTouchCancel={() => p.onTouching?.(false)}
    >
      <Map
        style={StyleSheet.absoluteFill}
        mapStyle={style}
        androidView="texture"
        logo={false}
        compass={false}
        attributionPosition={{ bottom: 4, left: 4 }}
        onDidFinishLoadingMap={() => setReady(true)}
        onPress={() => p.onMapPress()}
      >
        <Camera ref={camera} initialViewState={{ center: KISKUNHALAS, zoom: 13 }} />
        <Images images={{ arrow: require("../../assets/map/arrow.png") }} />

        {done && (
          <GeoJSONSource id="route-done" data={done}>
            <Layer type="line" id="route-done" paint={{ "line-color": "#9e9e9e", "line-width": 6 }} />
          </GeoJSONSource>
        )}
        {rest && (
          <GeoJSONSource id="route" data={rest}>
            <Layer
              type="line"
              id="route"
              layout={{ "line-join": "round", "line-cap": "round" }}
              paint={{ "line-color": p.follow ? "#1a73e8" : C.ac, "line-width": p.follow ? 7 : 4 }}
            />
          </GeoJSONSource>
        )}

        <GeoJSONSource
          id="pins"
          data={pinData}
          onPress={(e) => {
            e.stopPropagation();
            const id = e.nativeEvent.features[0]?.properties?.id;
            if (typeof id === "string") p.onPick(id);
          }}
        >
          <Layer
            type="circle"
            id="pins"
            layout={{ "circle-sort-key": PIN_ORDER as never }}
            paint={{
              "circle-radius": 14,
              "circle-color": PIN_COLOR as never,
              "circle-stroke-width": 2,
              "circle-stroke-color": "#ffffff",
            }}
          />
          {glyphs ? (
            <Layer
              type="symbol"
              id="pin-numbers"
              layout={{
                "text-field": ["get", "t"],
                "text-font": [FONT],
                "text-size": ["case", [">", ["length", ["get", "t"]], 2], 10, 12] as never,
                "text-allow-overlap": true,
                "text-ignore-placement": true,
                "symbol-sort-key": PIN_ORDER as never,
              }}
              paint={{ "text-color": "#ffffff" }}
            />
          ) : null}
        </GeoJSONSource>

        {focusData && (
          <GeoJSONSource id="focus" data={focusData}>
            <Layer
              type="circle"
              id="focus"
              paint={{
                "circle-radius": 21,
                "circle-color": "rgba(31,78,121,0.15)",
                "circle-stroke-width": 4,
                "circle-stroke-color": C.ac,
              }}
            />
          </GeoJSONSource>
        )}

        {meData && (
          <GeoJSONSource id="me" data={meData}>
            <Layer
              type="circle"
              id="me-dot"
              filter={["!", ["get", "dir"]]}
              paint={{
                "circle-radius": 9,
                "circle-color": "#1a73e8",
                "circle-stroke-width": 3,
                "circle-stroke-color": "#ffffff",
              }}
            />
            <Layer
              type="symbol"
              id="me"
              filter={["get", "dir"]}
              layout={{
                "icon-image": "arrow",
                "icon-size": 0.7,
                "icon-rotate": ["get", "h"] as never,
                "icon-rotation-alignment": "map",
                "icon-pitch-alignment": "map",
                "icon-allow-overlap": true,
                "icon-ignore-placement": true,
              }}
            />
          </GeoJSONSource>
        )}
      </Map>
    </View>
  );
});
