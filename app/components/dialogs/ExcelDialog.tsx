"use client";
// Excel letöltése egy napra vagy időszakra (legfeljebb 93 nap), egy vagy minden túrára.
import { useState } from "react";
import { api } from "@/lib/api";
import { addDays, daysInclusive, monthStart } from "@/lib/dates";
import type { Route } from "@/lib/types";
import { Dialog } from "./Dialog";

const MAX_DAYS = 93;

type Props = { day: string; today: string; routes: Route[]; onClose: () => void };

export function ExcelDialog({ day, today, routes, onClose }: Props) {
  const [from, setFrom] = useState(day);
  const [to, setTo] = useState(day);
  const [route, setRoute] = useState("all");
  const range = (f: string, t: string) => {
    setFrom(f);
    setTo(t);
  };
  const tooLong = daysInclusive(from, to) > MAX_DAYS;

  return (
    <Dialog onClose={onClose}>
      <b>Excel letöltése</b>
      <label className="xlr">
        <span>Ettől</span>
        <input
          type="date"
          value={from}
          max={today}
          onChange={(e) => range(e.target.value, e.target.value > to ? e.target.value : to)}
        />
      </label>
      <label className="xlr">
        <span>Eddig</span>
        <input
          type="date"
          value={to}
          max={today}
          onChange={(e) => range(e.target.value < from ? e.target.value : from, e.target.value)}
        />
      </label>
      <div className="mt">
        <button className={from === day && to === day ? "on" : ""} onClick={() => range(day, day)}>
          Kiválasztott nap
        </button>
        <button onClick={() => range(addDays(today, -6), today)}>Utolsó 7 nap</button>
        <button onClick={() => range(monthStart(today), today)}>Ez a hónap</button>
      </div>
      <select value={route} onChange={(e) => setRoute(e.target.value)}>
        <option value="all">Minden túra</option>
        {routes.map((r) => (
          <option key={r.id} value={r.id}>
            {r.name}
          </option>
        ))}
      </select>
      <small>
        Lapok: Összesítő (újságonként){from !== to ? ", Napok (napi bontás)" : ""}, Kiküldött, Hiányzik, Lemondva, Nem
        kezelt – minden sorban a dátummal. Legfeljebb {MAX_DAYS} nap.
      </small>
      <div className="row">
        <button onClick={onClose}>Bezár</button>
        {tooLong ? (
          <span className="xl-warn">Legfeljebb {MAX_DAYS} nap</span>
        ) : (
          <a className="xl-dl" href={api.exportUrl(from, to, route)}>
            ⬇ Letöltés
          </a>
        )}
      </div>
    </Dialog>
  );
}
