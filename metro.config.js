// Bundles the prebuilt content database (assets/db/content.db) as an asset.
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
if (!config.resolver.assetExts.includes('db')) config.resolver.assetExts.push('db');

module.exports = config;
