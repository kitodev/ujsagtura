# Újságtúra

Újságkézbesítő alkalmazás: napi címlista jelölésekkel, térkép, Google Maps-szerű navigáció, Excel be- és kivitel.
Next.js 15 (App Router) + React 19, MapLibre térkép, Neon (PostgreSQL) adatbázis.

## Indítás

```bash
npm install
cp .env.local.example .env.local   # DATABASE_URL beállítása
npm run dev
```

## Parancsok

| Parancs            | Mit csinál                                                      |
| ------------------ | --------------------------------------------------------------- |
| `npm run dev`      | fejlesztői szerver                                              |
| `npm run build`    | éles build                                                      |
| `npm run check`    | típusellenőrzés + lint + formázás ellenőrzése + unit tesztek    |
| `npm run lint`     | ESLint                                                          |
| `npm run format`   | Prettier – a teljes kód formázása                               |
| `npm test`         | unit tesztek (Vitest)                                           |
| `npm run test:e2e` | végponttól végpontig tartó tesztek (Playwright, mobil nézetben) |

### Adatbázisos (integrációs) tesztek

Az API-útvonalakat valódi PostgreSQL-lel tesztelik (a Neon helyett a `pg` csomaggal). Egy üres, **csak tesztre
használt** adatbázis kell – a tesztek minden futáskor törlik és újra létrehozzák a táblákat:

```bash
TEST_DATABASE_URL=postgres://postgres:jelszo@localhost/ujsagtura_test npm test
```

`TEST_DATABASE_URL` nélkül ezek a tesztek kimaradnak.

### Végponttól végpontig (E2E) tesztek

Első alkalommal a böngészőt telepíteni kell:

```bash
npx playwright install chromium
npm run test:e2e
```

A tesztek magukat indítják a fejlesztői szervert (3100-as port), és egy memóriában tárolt álszervert használnak
(`e2e/fixtures/fake-api.ts`): adatbázis és internet nélkül futnak. A térképcsempéket, az útvonaltervezőt és a
címkeresőt is helyettesítik.

## Felépítés

```
app/
  page.tsx                 a fő képernyő: összeköti a hookokat és a komponenseket
  api/…/route.ts           vékony API-útvonalak (a logika a lib/server-ben)
components/
  Map.tsx, map/            MapLibre térkép (címjelölők, útvonal, saját helyzet, kamera)
  Header, DayPicker, FilterBar, StopCard, PaperChip, NavPanel, AdvanceBanner, MapControls
  StopForm.tsx, Scan.tsx   cím-űrlap, beolvasás fotóról / Excelből
  dialogs/                 párbeszédablakok (új cím, szerkesztés, túra, Excel)
hooks/
  useTourData              túrák, címek, napi jelölések betöltése
  useGeolocation           GPS és menetirány (iránytűvel)
  useNavigation            útvonaltervezés, haladás, újratervezés, érkezés
  useAutoAdvance           elintézés után indulás a következő címre
  useRouteLine             a térkép útvonala („Hátralévő útvonal” is)
  useSearch, useSelection, useAddressCheck, useToast, useScreen, useScrolledDown
lib/                       tiszta (tesztelhető) logika
  deliveries.ts            jelölések szabályai (körbejárás, elintézett, következő cím, összesítő)
  navigation.ts            manőverek szövege, útvonalra illesztés
  route-order.ts           útvonal-sorrend (legközelebbi szomszéd + 2-opt)
  geo.ts, dates.ts, addr.ts, papers.ts, pins.ts, scan-text.ts
  api.ts, external.ts, geocode.ts   kliens oldali hívások (saját API, OSRM, Nominatim)
  server/                  adatbázis-műveletek (címek, jelölések, Excel, karbantartás)
tests/unit/                Vitest unit tesztek
tests/integration/         API-tesztek PostgreSQL-lel
e2e/                       Playwright tesztek
```

## Internet nélküli használat

- **Térkép:** a megnézett térképrészleteket a telefon elmenti; a „⋯ Több → 📥 Térkép mentése offline” a túrák
  környékét előre letölti (legfeljebb 1500 részlet, az OpenStreetMap ingyenes szerverének kímélésével).
- **Útvonaltervezés:** internettel az online tervező (OSRM); internet nélkül a telefonra mentett úthálózatból
  (`/api/roads` → `lib/road-graph.ts`, A\* keresés, magyar manőverekkel). A GPS internet nélkül is működik.
- **Alkalmazás és adatok:** a service worker (`public/sw.js`) elmenti az oldalt és a legutóbb betöltött listákat.
  Csak **https** (vagy a gépen `localhost`) alatt működik.
- **Jelölések:** internet nélkül várólistára kerülnek (`lib/outbox.ts`), és amint van hálózat, sorban elmennek.

## Fontosabb szabályok

- **Jelölés:** koppintásra jelöletlen → Leadva → Hiányzik → Lemondva → jelöletlen. Bármelyik jelölés
  elintézettnek számít.
- **Tartós lemondás:** a „Lemondva” a beállítás napjától érvényes, amíg egy későbbi napon át nem állítják
  (a megszűnést egy `none` jelölés rögzíti).
- **Egy cím csak egyszer:** a dupla címet a szerver elutasítja; a meglévő címhez csak új újság adható.
- **Összevont újságok:** a „PE + SPORT + VAS” külön újságokra bomlik.
