// A még el nem küldött jelölések rávetítése a szerver (vagy a tároló) válaszára,
// hogy internet nélkül is a valós állapot látszódjon.
import type { Mark } from "@shared/outbox";
import type { Deliveries, Status } from "@shared/types";

export function applyPendingMarks(d: Deliveries, marks: Mark[], day: string): Deliveries {
  const out = { ...d };
  for (const m of marks) {
    if (m.day !== day) continue;
    for (const id of m.ids) {
      if (m.status) out[id] = m.status as Status;
      else delete out[id];
    }
  }
  return out;
}
