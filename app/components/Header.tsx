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
  onSummary: () => void;
  onToggleMap: () => void;
  onSort: () => void;
  onAddStop: () => void;
  onAddRoute: () => void;
  onScan: () => void;
  onExcel: () => void;
};

/** Felső sáv: túrák, haladás, napválasztó, eszközök. */
export function Header(p: Props) {
  return (
    <header>
      <div className="tabs">
        {p.routes.map((r) => (
          <button key={r.id} className={r.id === p.route ? "on" : ""} onClick={() => p.onRoute(r.id)}>
            {r.name}
          </button>
        ))}
      </div>
      <div className="bar">
        <i style={{ width: `${p.total ? (p.done / p.total) * 100 : 0}%` }} />
      </div>
      <div className="meta">
        {p.done} / {p.total} újság kezelve
      </div>
      <DayPicker day={p.day} today={p.today} onChange={p.onDay} />
      <div className="tools">
        <button onClick={p.onSummary}>Összesítő</button>
        <button className={p.showMap ? "on" : ""} onClick={p.onToggleMap}>
          Térkép
        </button>
        <button onClick={p.onSort} disabled={!p.canSort}>
          Közelség szerinti sorrend
        </button>
        <button onClick={p.onAddStop}>+ Cím</button>
        <button onClick={p.onAddRoute}>+ Túra</button>
        <button onClick={p.onScan}>📷 Beolvasás</button>
        <button onClick={p.onExcel}>📊 Excel</button>
      </div>
    </header>
  );
}
