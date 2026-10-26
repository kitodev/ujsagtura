import type { StatusCounts } from "@/lib/deliveries";
import type { StatusFilter } from "@/lib/types";

const FILTERS: { key: StatusFilter; label: string }[] = [
  { key: "", label: "Mind" },
  { key: "todo", label: "Hátralévő" },
  { key: "delivered", label: "Leadva" },
  { key: "missing", label: "Hiányzik" },
  { key: "cancelled", label: "Lemondva" },
];

type Props = { value: StatusFilter; counts: StatusCounts; total: number; onChange: (f: StatusFilter) => void };

/** Szűrés állapot szerint, az újságok számával. Újra koppintva a szűrő kikapcsol. */
export function FilterBar({ value, counts, total, onChange }: Props) {
  return (
    <div className="flt">
      {FILTERS.map(({ key, label }) => (
        <button
          key={key || "all"}
          className={`f-${key || "all"}${value === key ? " on" : ""}`}
          onClick={() => onChange(value === key ? "" : key)}
        >
          {label}
          <b> {key ? counts[key] : total}</b>
        </button>
      ))}
    </div>
  );
}
