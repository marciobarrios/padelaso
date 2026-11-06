const { withXcodeProject } = require("expo/config-plugins");

// Expo writes CFBundleVersion into the phone plist but leaves Xcode's project
// version at its template default. Keep the phone's build settings in sync with
// the Watch target (which apple-targets creates from ios.buildNumber).
module.exports = (config) => withXcodeProject(config, (mod) => {
  const configurations = mod.modResults.pbxXCBuildConfigurationSection();
  for (const entry of Object.values(configurations)) {
    const settings = entry?.buildSettings;
    if (settings?.PRODUCT_BUNDLE_IDENTIFIER?.replaceAll('"', "") === mod.ios.bundleIdentifier) {
      settings.CURRENT_PROJECT_VERSION = mod.ios.buildNumber ?? "1";
    }
  }
  return mod;
});
