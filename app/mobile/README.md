# Újságtúra – telefonos alkalmazás (Expo / React Native)

Ugyanaz az Újságtúra Androidra és iPhone-ra: napi címlista jelölésekkel, térkép, navigáció hanggal, offline
térkép és útvonaltervezés. **Ugyanazt az adatbázist használja, mint a weboldal** – a webes alkalmazás API-ján
keresztül –, így ami a telefonon jelölve van, az a weben is látszik, és fordítva.

Expo SDK 58, React Native 0.88, TypeScript. Térkép: **MapLibre** (ugyanaz a térképmotor, mint a weben)
OpenStreetMap-részletekkel – **nem kell hozzá Google-kulcs**.

## Telepítés a telefonra (APK)

Az [EAS Build](https://docs.expo.dev/build/introduction/) a felhőben készíti el – Android Studio nem kell.

```bash
npm install
npm install -g eas-cli
eas login                       # ingyenes Expo-fiók (expo.dev)
eas build -p android --profile preview
```

A végén kapott linket nyisd meg a telefonon, töltsd le és telepítsd az APK-t (az Android rákérdez, hogy
engedélyezed-e az ismeretlen forrásból való telepítést – igen). Első indításkor az alkalmazás a **szerver címét**
kéri: ahol a webes Újságtúra fut (`https://…`). Később: ⋯ Több → ⚙ Beállítások. A cím előre is beépíthető:
`.env` fájl `EXPO_PUBLIC_API_URL=...` sorral (lásd `.env.example`).

A kész alkalmazás csak **https** szerverrel beszél (a webes alkalmazás Vercelen magától https-es).

iPhone-ra az App Store-on / TestFlighton keresztül lehet telepíteni (ehhez Apple fejlesztői fiók kell):
`eas build -p ios`.

## Fejlesztés

A MapLibre saját natív kódot hoz, ezért az **Expo Go nem elég**: egyszer egy fejlesztői változatot kell
telepíteni a telefonra, utána a kódváltozások azonnal megjelennek rajta.

```bash
eas build -p android --profile development   # egyszer: fejlesztői APK, telepítsd a telefonra
npx expo start                                # a fejlesztői alkalmazás ehhez csatlakozik (QR-kód)
```

## Mit tud

- Túrák, napválasztó (korábbi napok is), haladásjelző, keresés minden túrában, szűrés állapot szerint.
- Újság jelölése koppintással (Leadva → Hiányzik → Lemondva → jelöletlen), „Mind leadva”, tartós lemondás.
- Térkép: számozott címjelölők (zöld = kész, narancs = következő), útvonal, „Hátralévő útvonal”, saját helyzet.
  Jelölőre egyszer koppintva kis ablak (újságok jelölhetők, navigálás), másodszorra ugrás a listában a címhez;
  kártyára koppintva a cím megmutatása a térképen.
- Navigáció: manőverek, hátralévő idő és távolság, érkezési idő, letéréskor újratervezés, hangos bemondás,
  „3D” menetirány-nézet, a kijelző nem alszik el. A cél közelében a lista a cél kártyájához ugrik; ha a cím minden
  újságja jelölve van, 4 mp múlva indul a következő címre.
- Új cím (dupla cím figyelése, meglévő címhez újság hozzáadása), szerkesztés, törlés, új túra.
- ⋯ Több: Összesítő (megosztható), közelség szerinti sorrend, címek feltérképezése, offline térkép mentése,
  Excel-kimutatás (a telefon böngészője tölti le), beállítások.

A fotóról / Excelből beolvasás csak a webes változatban van.

## Internet nélkül

- **Térkép:** a megnézett térképrészleteket a térkép megőrzi (150 MB-ig); a „⋯ Több → 📥 Térkép mentése offline” a
  túrák környékét előre letölti (MapLibre offline csomag, legfeljebb ~1500 részlet). Internet nélkül ezekből rajzol.
  A jelölők számaihoz szükséges betűképet az alkalmazás magával hozza (`assets/map`, `scripts/make-map-assets.py`).
- **Útvonal:** internettel az online tervező (OSRM), nélküle a telefonra mentett úthálózat (ugyanaz a kód, mint a
  weben: `lib/road-graph.ts`). A GPS internet nélkül is működik.
- **Listák:** a legutóbb letöltött túrák és címek a telefonon maradnak.
- **Jelölések:** várólistára kerülnek, és amint van hálózat, sorban elmennek (a felső sáv mutatja, hány vár).

## Felépítés

```
App.tsx                 indulás: beállítások, várólista, szervercím bekérése
src/MainScreen.tsx      a fő képernyő (térkép, fejléc, lista, párbeszédek) – a webes app/page.tsx megfelelője
src/components/         TourMap (MapLibre), MapButtons, PinInfo, NavPanel, Header, DayPicker, FilterBar, StopCard,
                        PaperChip, StopForm, AdvanceBanner, ui; dialogs/ (cím, túra, Excel, beállítások)
src/hooks/              useTourData, useLocation (GPS + iránytű), useNavigation, useAutoAdvance, useRouteLine,
                        useConnection, useSearch, useSelection, useAddressCheck, useToast
src/lib/                api (szerverhívások, offline tárolás, várólista), routing (OSRM / offline),
                        road-store, offline-map (offline csomag), map-style (stílus, betűkép), settings, storage, net, speech, time …
../lib/                 KÖZÖS a webes alkalmazással (`@shared/...`): jelölések szabályai, navigáció, útvonal-sorrend,
                        úthálózat, dátumok, újságok – egy helyen, mindkét változat ezt használja
tests/                  Vitest unit tesztek
```

A közös `../lib` kódot a `metro.config.js` (watchFolders) és a `tsconfig.json` (`@shared/*`) köti be.
Ezért az alkalmazást a teljes repóból kell építeni (az EAS Build ezt magától így teszi).

## Parancsok

| Parancs             | Mit csinál                                |
| ------------------- | ----------------------------------------- |
| `npx expo start`    | fejlesztői szerver (a fejlesztői APK-hoz) |
| `npm run check`     | típusellenőrzés + unit tesztek            |
| `npx eslint .`      | lint                                      |
| `npm run build:apk` | Android APK az EAS Builddel               |
| `npm run build:dev` | fejlesztői APK (egyszer kell)             |
