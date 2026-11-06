/* global __dirname */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { createRequire } = require("node:module");

// Use the parser pinned by apple-targets; Xcode's synchronized groups require it.
const requireTargets = createRequire(require.resolve("@bacons/apple-targets/app.plugin"));
const { XcodeProject } = requireTargets("@bacons/xcode");
const appRoot = path.resolve(__dirname, "..");
const ios = path.join(appRoot, "ios");
const projectName = fs.readdirSync(ios).find((name) => name.endsWith(".xcodeproj"));
assert(projectName, "Generate iOS first");
const project = XcodeProject.open(path.join(ios, projectName, "project.pbxproj"));
const targets = project.rootObject.props.targets;
const watch = targets.find((target) => target.props.name === "PadelasoWatch");
const phone = targets.find((target) => target !== watch);
assert(watch && phone, "Both app targets must exist");
const phoneSettings = phone.getDefaultConfiguration().props.buildSettings;
const watchSettings = watch.getDefaultConfiguration().props.buildSettings;
assert.equal(watchSettings.PRODUCT_BUNDLE_IDENTIFIER, `${phoneSettings.PRODUCT_BUNDLE_IDENTIFIER}.watch`);
assert.equal(watchSettings.INFOPLIST_KEY_WKCompanionAppBundleIdentifier, phoneSettings.PRODUCT_BUNDLE_IDENTIFIER);
assert.equal(String(watchSettings.CURRENT_PROJECT_VERSION), String(phoneSettings.CURRENT_PROJECT_VERSION));
assert.equal(watchSettings.MARKETING_VERSION, phoneSettings.MARKETING_VERSION);
assert.equal(watchSettings.SDKROOT, "watchos");
assert.equal(String(watchSettings.WATCHOS_DEPLOYMENT_TARGET), "10.0");
const embed = phone.props.buildPhases.find((phase) => phase.props.name === "Embed Watch Content");
assert(embed && embed.props.files.length === 1, "Phone must embed exactly one Watch app");
assert(watch.props.fileSystemSynchronizedGroups.some((group) => group.props.path === "watch"));
assert.equal(watchSettings.ASSETCATALOG_COMPILER_APPICON_NAME, "AppIcon");
console.log(JSON.stringify({
  phone: phoneSettings.PRODUCT_BUNDLE_IDENTIFIER,
  watch: watchSettings.PRODUCT_BUNDLE_IDENTIFIER,
  version: watchSettings.MARKETING_VERSION,
  build: String(watchSettings.CURRENT_PROJECT_VERSION),
  embedsWatch: true,
}));
