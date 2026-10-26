// Az app.json kiegészítése: a Google Maps Android-kulcs környezeti változóból jön (nem kerül a kódba).
// Expo Go-ban kulcs nélkül is működik; a saját APK-hoz (EAS Build) kell: GOOGLE_MAPS_ANDROID_KEY.
module.exports = ({ config }) => ({
  ...config,
  android: {
    ...config.android,
    config: { googleMaps: { apiKey: process.env.GOOGLE_MAPS_ANDROID_KEY ?? "" } },
  },
});
