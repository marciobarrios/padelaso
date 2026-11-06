# Local Expo modules

Create app-owned Swift/Kotlin modules here with `pnpm dlx create-expo-module@latest --local` from `apps/mobile`.
Commit the generated module package, `expo-module.config.json`, Swift/Kotlin sources and podspec/Gradle files under this directory. Expo autolinking searches `./modules` by default.

Never put the only copy of native source under generated `apps/mobile/ios` or `apps/mobile/android`. Those directories are disposable. Config plugins belong in `apps/mobile/plugins`; future Watch targets and their Swift sources belong in `apps/mobile/targets` (MAR-44 selects the target integration).
After adding a module or plugin, regenerate and rebuild the development client. Document and commit any native configuration as a plugin before using `prebuild --clean`.

`watch-spike` is an Apple-only module that opens the native test-credential form.
Its config points to `../../WatchSpike.podspec` at the app root so CocoaPods can
compile the shared Watch sources within its source boundary. The token stays
in native memory/Keychain and WatchConnectivity; JavaScript only opens the form.
