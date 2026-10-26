import { sinceLabel, STATUS_LABEL } from "@/lib/deliveries";
import type { Paper, Status } from "@/lib/types";

type Props = {
  paper: Paper;
  status?: Status;
  /** Örökölt lemondás kezdőnapja. */
  since?: string;
  /** Kiemelés, ha még le kell adni (navigáció alsó sávja). */
  highlightTodo?: boolean;
  onClick: () => void;
};

/** Egy újság gombja a jelölésével (koppintásra a jelölés körbe jár). */
export function PaperChip({ paper, status, since, highlightTodo, onClick }: Props) {
  const label = status ? ` · ${STATUS_LABEL[status]}${status === "cancelled" ? sinceLabel(since) : ""}` : "";
  return (
    <button className={`chip ${status ?? ""}${highlightTodo && !status ? " todo" : ""}`} onClick={onClick}>
      {paper.paper}
      {label}
    </button>
  );
}
