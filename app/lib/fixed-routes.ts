// Állandó túrák: ha még nincsenek az adatbázisban, szerverindításkor létrejönnek (üresen, a címeket te viszed fel).
// Új állandó túra: egy új sor ide. A túra azonosítója a sorrendet is adja (a fülek azonosító szerint rendezve).
export const FIXED_ROUTES: { id: string; name: string; note?: string }[] = [{ id: "253-napi", name: "253-as napi" }];
