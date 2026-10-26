import type { Advance } from "@/hooks/useAutoAdvance";

type Props = { advance: Advance; secondsLeft: number; onGoNow: () => void; onStay: () => void };

/** „Elintézve – indulás a következő címre N mp múlva” sáv. */
export function AdvanceBanner({ advance, secondsLeft, onGoNow, onStay }: Props) {
  return (
    <div className="adv" role="status">
      <div>
        ✅ <b>{advance.from.address}</b> elintézve
      </div>
      {advance.to ? (
        <div>
          ➡️ Következő: <b>{advance.to.address}</b> – indulás {secondsLeft} mp múlva
        </div>
      ) : (
        <div>🎉 Ez volt az utolsó cím.</div>
      )}
      <div className="mt" style={{ marginTop: 6 }}>
        <button className="on" onClick={onGoNow}>
          {advance.to ? "Indulás most" : "Befejezés"}
        </button>
        <button onClick={onStay}>Maradok</button>
      </div>
    </div>
  );
}
