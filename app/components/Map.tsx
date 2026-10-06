"use client";
import { MapContainer, TileLayer, Marker, Tooltip, CircleMarker, Polyline, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect } from "react";

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
  useEffect(() => { if (on && me) map.setView([me.lat, me.lon], Math.max(map.getZoom(), 16)); }, [on, me, map]);
  return null;
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
