"use client";
// Felső sáv, tömören (hogy a térképnek több hely jusson): túrák, nap + haladás, és a fő gombok.
// A ritkábban használt eszközök a „⋯ Több” menüben vannak.
import { useState } from "react";
import type { Route } from "@/lib/types";
import { DayPicker } from "./DayPicker";

type Props = {
  routes: Route[];
  route: string;
  onRoute: (id: string) => void;
  done: number;
  total: number;
  day: string;
  today: string;
  onDay: (day: string) => void;
  showMap: boolean;
  canSort: boolean;
  mapping: boolean;
  onSummary: () => void;
  onToggleMap: () => void;
  onSort: () => void;
  onAddStop: () => void;
  onAddRoute: () => void;
  onScan: () => void;
  onExcel: () => void;
  onLocateStops: () => void;
  onRelocateStops: () => void;
  offlineSaving: boolean;
  onSaveOffline: () => void;
};

export function Header(p: Props) {
  const [menu, setMenu] = useState(false);
  /** Menüpont: végrehajtja a műveletet és bezárja a menüt. */
  const item = (label: string, action: () => void, disabled = false) => (
    <button
      disabled={disabled}
      onClick={() => {
        setMenu(false);
        action();
      }}
    >
      {label}
    </button>
  );

  return (
    <header>
      <div className="tabs">
        {p.routes.map((r) => (
          <button key={r.id} className={r.id === p.route ? "on" : ""} onClick={() => p.onRoute(r.id)}>
            {r.name}
          </button>
        ))}
      </div>

      <div className="head-row">
        <DayPicker day={p.day} today={p.today} onChange={p.onDay} />
        <div className="progress" title="Kezelt újságok">
          <div className="bar">
            <i style={{ width: `${p.total ? (p.done / p.total) * 100 : 0}%` }} />
          </div>
          <div className="meta">
            {p.done} / {p.total} újság kezelve
          </div>
        </div>
      </div>

      <div className="tools">
        <button className={p.showMap ? "on" : ""} onClick={p.onToggleMap}>
          🗺 Térkép
        </button>
        <button onClick={p.onAddStop}>+ Cím</button>
        <button className={menu ? "on" : ""} aria-expanded={menu} onClick={() => setMenu(!menu)}>
          ⋯ Több
        </button>
      </div>

      {menu && (
        <>
          <div className="menu-backdrop" onClick={() => setMenu(false)} />
          <div className="menu" role="menu">
            {item("Összesítő", p.onSummary)}
            {item("Közelség szerinti sorrend", p.onSort, !p.canSort)}
            {item(p.mapping ? "Feltérképezés…" : "Címek feltérképezése", p.onLocateStops, p.mapping)}
            {item("Újraszámolás", p.onRelocateStops, p.mapping)}
            {item(p.offlineSaving ? "Térkép mentése…" : "📥 Térkép mentése offline", p.onSaveOffline, p.offlineSaving)}
            {item("+ Túra", p.onAddRoute)}
            {item("📷 Beolvasás", p.onScan)}
            {item("📊 Excel", p.onExcel)}
          </div>
        </>
      )}
    </header>
  );
}
