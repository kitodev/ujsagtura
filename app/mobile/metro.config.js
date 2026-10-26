// Metro: a webes alkalmazás közös, tiszta logikája (../lib) is bekerül a telefonos csomagba.
const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);
config.watchFolders = [...(config.watchFolders ?? []), path.resolve(__dirname, "../lib")];

module.exports = config;
