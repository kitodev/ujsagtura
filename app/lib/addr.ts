// Cím összehasonlító kulcs: így a „Kossuth utca 5.”, „kossuth u. 5”, „Kossuth Utca 5” ugyanannak számít.
// Egy cím csak egyszer szerepelhet a rendszerben (minden túrát együtt nézve).
export function addrKey(a: string): string {
  return a
    .replace(/\(.*?\)/g, " ")                       // zárójeles megjegyzés nem számít
    .normalize("NFD").replace(/[̀-ͯ]/g, "") // ékezetek nélkül
    .toLowerCase()
    .replace(/[.,;:]/g, " ")
    .replace(/\s*([/-])\s*/g, "$1")                 // „5 / A” = „5/A”
    .replace(/\b(\d+)\s+([a-z])\b/g, "$1$2")        // „5 A” = „5A”
    .replace(/\b(\d+)\/([a-z])\b/g, "$1$2")         // „5/A” = „5A”
    .replace(/\butca\b/g, "u")
    .replace(/\b(ut|utja)\b/g, "ut")
    .replace(/\b(korut|krt)\b/g, "krt")
    .replace(/\b(tere|ter)\b/g, "ter")
    .replace(/\b(koz|koze)\b/g, "koz")
    .replace(/\bsetany\b/g, "stny")
    .replace(/\bdr\b/g, "dr")
    .replace(/\s+/g, " ")
    .trim();
}
