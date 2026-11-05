// A térkép stílusa: OpenStreetMap-részletek, és a címjelölők számaihoz saját betűkép (glyph), amelyet az
// alkalmazás magával hoz (assets/map, lásd scripts/make-map-assets.py) – így nem kell hozzá külső szerver,
// és internet nélkül is működik.
import type { StyleSpecification } from "@maplibre/maplibre-react-native";
import { Asset } from "expo-asset";
import { Directory, File, Paths } from "expo-file-system";

export const FONT = "UjsagturaBold";
export const OSM_TILES = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const GLYPH_VERSION = "v1";

/* eslint-disable @typescript-eslint/no-require-imports -- az alkalmazással szállított fájlok csak így tölthetők be */
const GLYPHS: Record<string, number> = {
  "0-255": require("../../assets/map/glyphs-0-255.pbf"),
  "9984-10239": require("../../assets/map/glyphs-9984-10239.pbf"),
};
/* eslint-enable @typescript-eslint/no-require-imports */

const withoutSlash = (uri: string) => uri.replace(/\/+$/, "");

/** A betűképek mappája a telefonon: <dokumentumok>/glyphs-v1/UjsagturaBold/{tartomány}.pbf */
const glyphRoot = () => new Directory(Paths.document, `glyphs-${GLYPH_VERSION}`);

/** A betűképek kimásolása a telefonra (egyszer). Visszaadja a stílus `glyphs` címét. */
export async function prepareGlyphs(): Promise<string> {
  const dir = new Directory(glyphRoot(), FONT);
  dir.create({ intermediates: true, idempotent: true });
  for (const [range, mod] of Object.entries(GLYPHS)) {
    const target = new File(dir, `${range}.pbf`);
    if (target.exists) continue;
    const asset = Asset.fromModule(mod);
    await asset.downloadAsync();
    if (asset.localUri) new File(asset.localUri).copy(target);
  }
  return `${withoutSlash(glyphRoot().uri)}/{fontstack}/{range}.pbf`;
}

/** A térkép alapstílusa (a jelölők, az útvonal stb. a térkép saját rétegeiként kerülnek rá). */
export const baseStyle = (glyphs: string): StyleSpecification => ({
  version: 8,
  glyphs,
  sources: {
    osm: {
      type: "raster",
      tiles: [OSM_TILES],
      tileSize: 256,
      maxzoom: 19,
      attribution: "© OpenStreetMap",
    },
  },
  layers: [
    { id: "bg", type: "background", paint: { "background-color": "#f2efe9" } },
    { id: "osm", type: "raster", source: "osm" },
  ],
});

/** A stílus fájlba írva (az offline letöltés stílus-címet vár). */
export async function styleFileUri(): Promise<string> {
  const file = new File(Paths.document, "map-style.json");
  await file.write(JSON.stringify(baseStyle(await prepareGlyphs())));
  return file.uri;
}
