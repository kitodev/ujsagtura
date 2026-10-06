"use client";
import { MapContainer, TileLayer, Marker, Tooltip, CircleMarker, Polyline, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect, useRef, useState } from "react";

export type Pin = { id: string; n: number; lat: number; lon: number; cls: string; label: string };

function Fit({ pins }: { pins: Pin[] }) {
  const map = useMap();
  useEffect(() => {
    if (pins.length) map.fitBounds(pins.map((p) => [p.lat, p.lon] as [number, number]), { padding: [30, 30] });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pins.length]);
  return null;
}

type LL = { lat: number; lon: number };

function Follow({ me, on }: { me: LL | null; on: boolean }) {
  const map = useMap();
  const [following, setFollowing] = useState(true);
  const prevOn = useRef(false);

  // Amikor elindul a navigáció, kapcsoljuk be automatikusan a követést
  useEffect(() => {
    if (on && !prevOn.current) {
      setFollowing(true);
      if (me) map.setView([me.lat, me.lon], Math.max(map.getZoom(), 16));
    }
    prevOn.current = on;
  }, [on, me, map]);

  // Ha a felhasználó kézzel elmozdítja vagy belenagyít/kicsinyít a térképbe, szüneteltetjük a követést
  useEffect(() => {
    if (!on) return;
    const stopFollow = () => setFollowing(false);
    map.on("dragstart", stopFollow);
    return () => {
      map.off("dragstart", stopFollow);
    };
  }, [on, map]);

  // Amíg a követés aktív, a GPS frissülésekor követjük a pozíciót
  useEffect(() => {
    if (on && following && me) {
      map.setView([me.lat, me.lon], Math.max(map.getZoom(), 16));
    }
  }, [on, following, me, map]);

  // Ha a navigáció fut, de a követést a kézi mozgatás megszakította, megjelenítünk egy visszaugrás gombot
  if (!on || following || !me) return null;

  return (
    <div
      ref={(el) => {
        if (el) {
          L.DomEvent.disableClickPropagation(el);
          L.DomEvent.disableScrollPropagation(el);
        }
      }}
      style={{
        position: "absolute",
        bottom: 12,
        right: 12,
        zIndex: 1000,
      }}
    >
      <button
        type="button"
        onClick={() => {
          setFollowing(true);
          map.setView([me.lat, me.lon], Math.max(map.getZoom(), 16));
        }}
        style={{
          background: "var(--card, #fff)",
          color: "var(--tx, #1d1d1b)",
          border: "2px solid var(--ac, #1f4e79)",
          borderRadius: "20px",
          padding: "7px 13px",
          fontSize: "13px",
          fontWeight: 700,
          cursor: "pointer",
          boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
          display: "flex",
          alignItems: "center",
          gap: "6px",
        }}
      >
        🎯 Vissza a helyzetemhez
      </button>
    </div>
  );
}

function FitLine({ line }: { line: [number, number][] | null }) {
  const map = useMap();
  useEffect(() => { if (line?.length) map.fitBounds(line, { padding: [30, 30] }); }, [line, map]);
  return null;
}

export default function Map({ pins, me, onPick, line, follow }: { pins: Pin[]; me: LL | null; onPick: (id: string) => void; line: [number, number][] | null; follow: boolean }) {
  return (
    <MapContainer center={[46.434, 19.485]} zoom={14} style={{ height: "38vh" }}>
      <TileLayer url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="© OpenStreetMap" maxZoom={19} />
      <Fit pins={pins} />
      <FitLine line={line} />
      <Follow me={me} on={follow} />
      {line && <Polyline positions={line} pathOptions={{ color: "#1976d2", weight: 6, opacity: 0.8 }} />}
      {pins.map((p) => (
        <Marker key={p.id} position={[p.lat, p.lon]} eventHandlers={{ click: () => onPick(p.id) }}
          icon={L.divIcon({ className: "", html: `<div class="pin ${p.cls}">${p.n}</div>`, iconSize: [26, 26] })}>
          <Tooltip>{p.label}</Tooltip>
        </Marker>
      ))}
      {me && <CircleMarker center={[me.lat, me.lon]} radius={8} pathOptions={{ color: "#1976d2" }} />}
    </MapContainer>
  );
}
