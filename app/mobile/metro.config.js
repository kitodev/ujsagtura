// Metro: a webes alkalmazás közös, tiszta logikája (../lib) is bekerül a telefonos csomagba.
const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);
config.watchFolders = [...(config.watchFolders ?? []), path.resolve(__dirname, "../lib")];

// a térkép saját betűképei (assets/map/*.pbf) az alkalmazással együtt kerülnek a telefonra
config.resolver.assetExts = [...config.resolver.assetExts, "pbf"];

module.exports = config;
