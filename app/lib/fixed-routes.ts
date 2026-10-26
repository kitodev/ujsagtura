// Állandó túrák: ha még nincsenek az adatbázisban, szerverindításkor létrejönnek (üresen, a címeket te viszed fel).
// Új állandó túra: egy új sor ide. A túra azonosítója a sorrendet is adja (a fülek azonosító szerint rendezve).
//
// separate: önálló túra a dupla címek szempontjából – a címei csak egymással nem ütközhetnek, így olyan cím is
// felvehető bele, ami egy másik túrában már szerepel (pl. a „253-as napi” a 253-as címeit is tartalmazhatja).
export const FIXED_ROUTES: { id: string; name: string; note?: string; separate?: boolean }[] = [
  { id: "253-napi", name: "253-as napi", separate: true },
];

const SEPARATE = new Set(FIXED_ROUTES.filter((r) => r.separate).map((r) => r.id));

/**
 * A címek „csoportja”: egy cím csoportonként csak egyszer szerepelhet.
 * Az önálló túrák saját csoportot alkotnak, minden más túra egy közös csoportba tartozik.
 */
export const addressGroup = (routeId: string | null | undefined) =>
  routeId && SEPARATE.has(routeId) ? `route:${routeId}` : "common";
