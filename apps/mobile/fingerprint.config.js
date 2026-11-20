// Expo hashes this whole app folder for the native runtime fingerprint
// (runtimeVersion policy "fingerprint"). Ignore files that ship only in the
// JS bundle or never reach a build, so a JS-only change keeps the runtime and
// a Swift, Watch, native module, plugin or app config change always gets a new one.
/** @type {import('@expo/fingerprint').Config} */
module.exports = {
  ignorePaths: [
    "src/**/*",
    "tests/**/*",
    "evidence/**/*",
    "dist/**/*",
    "**/*.md",
    ".env*",
    "eslint.config.cjs",
    "tsconfig.json",
  ],
};
