const { getDefaultConfig } = require("expo/metro-config");

// Expo owns monorepo discovery, isolated pnpm resolution and native autolinking.
module.exports = getDefaultConfig(__dirname);
