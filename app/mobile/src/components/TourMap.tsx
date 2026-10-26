// A térkép: OpenStreetMap-részletek (megnézéskor a telefonra mentve, internet nélkül onnan), címjelölők,
// útvonal, saját helyzet iránynyíllal, navigáció közben követő (és „3D”, menetirányba forgatott) kamera.
import { forwardRef, memo, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import MapView, { Marker, Polyline, PROVIDER_GOOGLE, UrlTile, type LatLng } from "react-native-maps";
import type { LatLon } from "@shared/geo";
import type { Pin } from "@shared/pins";
import { OSM_TILE_TEMPLATE, tileDir } from "@/lib/offline-map";
import { C } from "@/theme";

const KISKUNHALAS = { latitude: 46.4336, longitude: 19.4847, latitudeDelta: 0.06, longitudeDelta: 0.06 };
const PIN_COLOR: Record<Pin["cls"], string> = { "": "#666666", d: C.ok, h: C.half, n: C.mi };
const TILE_MAX_AGE_S = 60 * 60 * 24 * 30;
const EDGE = { top: 50, right: 40, bottom: 50, left: 40 };
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
  online: boolean;
  focus: MapFocus | null;
  onPick: (id: string) => void;
  onMapPress: () => void;
};

const toLatLng = ([lat, lon]: [number, number]): LatLng => ({ latitude: lat, longitude: lon });

/** Címjelölő. A kép (szám a körben) csak az első rajzolásig frissül – így sok jelölő mellett is gyors marad. */
const PinMarker = memo(function PinMarker({ pin, onPick }: { pin: Pin; onPick: (id: string) => void }) {
  const [track, setTrack] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setTrack(false), 600);
    return () => clearTimeout(t);
  }, []);
  const text = pin.t ?? String(pin.n);
  return (
    <Marker
      coordinate={{ latitude: pin.lat, longitude: pin.lon }}
      anchor={{ x: 0.5, y: 0.5 }}
      tracksViewChanges={track}
      zIndex={pin.cls === "n" ? 3 : pin.cls === "d" ? 1 : 2}
      onPress={(e) => {
        e.stopPropagation?.();
        onPick(pin.id);
      }}
      accessibilityLabel={pin.label}
    >
      <View style={[s.pin, { backgroundColor: PIN_COLOR[pin.cls] }]}>
        <Text style={[s.pinText, text.length > 2 && { fontSize: 10 }]}>{text}</Text>
      </View>
    </Marker>
  );
});

export const TourMap = forwardRef<TourMapHandle, Props>(function TourMap(p, ref) {
  const map = useRef<MapView>(null);
  const [ready, setReady] = useState(false);
  const fitted = useRef("");
  // állandó függvény a jelölőknek (így a GPS-frissítések nem rajzolják újra mindet)
  const pickRef = useRef(p.onPick);
  pickRef.current = p.onPick;
  const pick = useCallback((id: string) => pickRef.current(id), []);

  useEffect(() => {
    try {
      tileDir().create({ intermediates: true, idempotent: true });
    } catch {
      /* a térkép mentés nélkül is működik */
    }
  }, []);

  useImperativeHandle(ref, () => ({
    center: (pt) =>
      map.current?.animateCamera(
        { center: { latitude: pt.lat, longitude: pt.lon }, zoom: 17, altitude: 700 },
        { duration: 500 },
      ),
  }));

  // ráközelítés a túra címeire (induláskor és túraváltáskor), ha nem navigálunk
  const fitKey = p.fitIds.join(",");
  useEffect(() => {
    if (!ready || p.follow || !fitKey || fitted.current === fitKey) return;
    const ids = new Set(p.fitIds);
    const coords = p.pins.filter((x) => ids.has(x.id)).map((x) => ({ latitude: x.lat, longitude: x.lon }));
    if (!coords.length) return;
    fitted.current = fitKey;
    if (coords.length === 1) map.current?.animateCamera({ center: coords[0], zoom: 16, altitude: 1200 });
    else map.current?.fitToCoordinates(coords, { edgePadding: EDGE, animated: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- a `fitKey` írja le a változást
  }, [ready, fitKey, p.pins.length, p.follow]);

  // a listában kiválasztott cím megmutatása
  useEffect(() => {
    if (!ready || !p.focus) return;
    map.current?.animateCamera(
      { center: { latitude: p.focus.lat, longitude: p.focus.lon }, zoom: 17, altitude: 700 },
      { duration: 500 },
    );
  }, [ready, p.focus]);

  // navigáció: a kamera követi a helyzetet; „3D” módban menetirányba fordít és megdönti a térképet
  const lastFollow = useRef(0);
  useEffect(() => {
    if (!ready || !p.follow || !p.me) return;
    const now = Date.now();
    if (now - lastFollow.current < FOLLOW_MS / 2) return;
    lastFollow.current = now;
    map.current?.animateCamera(
      {
        center: { latitude: p.me.lat, longitude: p.me.lon },
        heading: p.drive ? (p.heading ?? 0) : 0,
        pitch: p.drive ? 55 : 0,
        zoom: p.drive ? 18 : 17,
        altitude: p.drive ? 300 : 700,
      },
      { duration: FOLLOW_MS },
    );
  }, [ready, p.follow, p.drive, p.me, p.heading]);

  const [done, rest] = useMemo(() => {
    if (!p.line) return [null, null];
    const coords = p.line.map(toLatLng);
    if (!p.cut) return [null, coords];
    const pt = toLatLng(p.cut.pt);
    return [
      [...coords.slice(0, p.cut.i + 1), pt],
      [pt, ...coords.slice(p.cut.i + 1)],
    ];
  }, [p.line, p.cut]);

  // a térkép saját nézete helyett (Androidon) csak az OpenStreetMap-részletek látszanak
  const android = Platform.OS === "android";

  return (
    <MapView
      ref={map}
      style={StyleSheet.absoluteFill}
      provider={android ? PROVIDER_GOOGLE : undefined}
      mapType={android ? "none" : "standard"}
      initialRegion={KISKUNHALAS}
      onMapReady={() => setReady(true)}
      rotateEnabled
      pitchEnabled
      toolbarEnabled={false}
      showsCompass={false}
      showsPointsOfInterests={false}
      moveOnMarkerPress={false}
      onPress={(e) => {
        if ((e.nativeEvent as { action?: string }).action !== "marker-press") p.onMapPress();
      }}
    >
      <UrlTile
        urlTemplate={OSM_TILE_TEMPLATE}
        maximumZ={19}
        tileCachePath={tileDir().uri}
        tileCacheMaxAge={TILE_MAX_AGE_S}
        offlineMode={!p.online}
        shouldReplaceMapContent
        zIndex={-1}
      />
      {done && <Polyline coordinates={done} strokeColor="#9e9e9e" strokeWidth={6} />}
      {rest && <Polyline coordinates={rest} strokeColor={p.follow ? "#1a73e8" : C.ac} strokeWidth={p.follow ? 7 : 4} />}
      {p.pins.map((pin) => (
        <PinMarker key={`${pin.id}|${pin.cls}|${pin.t ?? pin.n}`} pin={pin} onPick={pick} />
      ))}
      {p.focus && (
        <Marker
          key={`focus${p.focus.k}`}
          coordinate={{ latitude: p.focus.lat, longitude: p.focus.lon }}
          title={p.focus.label}
          pinColor={C.ac}
          zIndex={4}
        />
      )}
      {p.me && (
        <Marker
          coordinate={{ latitude: p.me.lat, longitude: p.me.lon }}
          anchor={{ x: 0.5, y: 0.5 }}
          flat
          rotation={p.heading ?? 0}
          tracksViewChanges={false}
          zIndex={5}
        >
          <View style={s.me}>
            <Text style={s.meArrow}>{p.heading == null ? "●" : "▲"}</Text>
          </View>
        </Marker>
      )}
    </MapView>
  );
});

const s = StyleSheet.create({
  pin: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  pinText: { color: "#fff", fontWeight: "800", fontSize: 12 },
  me: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "#1a73e8",
    borderWidth: 3,
    borderColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  meArrow: { color: "#fff", fontSize: 13, fontWeight: "900", marginTop: -2 },
});
