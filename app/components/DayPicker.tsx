import { addDays, formatLongHu } from "@/lib/dates";

type Props = { day: string; today: string; onChange: (day: string) => void };

/** Napválasztó: előző / következő nap, naptár, „Ma”. Jövőbeli nap nem választható. */
export function DayPicker({ day, today, onChange }: Props) {
  const shift = (n: number) => {
    const next = addDays(day, n);
    if (next <= today) onChange(next);
  };
  return (
    <>
      <div className="day">
        <button onClick={() => shift(-1)} aria-label="Előző nap">
          ◀
        </button>
        <input
          type="date"
          value={day}
          max={today}
          onChange={(e) => e.target.value && onChange(e.target.value > today ? today : e.target.value)}
        />
        <button onClick={() => shift(1)} disabled={day >= today} aria-label="Következő nap">
          ▶
        </button>
        {day !== today && (
          <button className="on" onClick={() => onChange(today)}>
            Ma
          </button>
        )}
      </div>
      {day !== today && <div className="past">📅 {formatLongHu(day)} – a jelölések erre a napra kerülnek</div>}
    </>
  );
}
