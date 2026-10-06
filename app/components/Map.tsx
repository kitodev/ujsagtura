"use client";
import { MapContainer, TileLayer, Marker, Tooltip, CircleMarker, useMap } from "react-leaflet";
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

export default function Map({ pins, me, onPick }: { pins: Pin[]; me: { lat: number; lon: number } | null; onPick: (id: string) => void }) {
  return (
    <MapContainer center={[46.49, 19.74]} zoom={14} style={{ height: "38vh" }}>
      <TileLayer url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="© OpenStreetMap" maxZoom={19} />
      <Fit pins={pins} />
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
