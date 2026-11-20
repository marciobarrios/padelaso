# Mobile releases

How Padelaso's iPhone app, its embedded Apple Watch app and the Android app
are built for testing and release. This file covers the build profiles,
versions and runtime policy (MAR-167). Signing, TestFlight
([MAR-170](https://linear.app/marciobarrios/issue/MAR-170)), Android internal
testing ([MAR-171](https://linear.app/marciobarrios/issue/MAR-171)), native CI
builds ([MAR-168](https://linear.app/marciobarrios/issue/MAR-168)) and crash
reporting ([MAR-169](https://linear.app/marciobarrios/issue/MAR-169)) add
their sections here as they land.

## Environments

`EXPO_PUBLIC_APP_ENV` picks the app variant. Each one installs side by side
with the others.

| Environment | App name | Link scheme | iPhone / Android ID | Watch ID |
| --- | --- | --- | --- | --- |
| `development` | Padelaso Dev | `padelaso-dev` | `com.padelaso.mobile.dev` | `com.padelaso.mobile.dev.watch` |
| `test` | Padelaso Test | `padelaso-test` | `com.padelaso.mobile.test` | `com.padelaso.mobile.test.watch` |
| `production` | Padelaso | `padelaso` | `com.padelaso.mobile` | `com.padelaso.mobile.watch` |

`app.config.ts` rejects any other value. The link scheme must also be in the
backend's allowed auth redirect URLs (`<scheme>://auth/callback`). The local
stack lists all three in `supabase/config.toml`. The hosted projects are set
in the Supabase dashboard; add `padelaso://auth/callback` there before the
first production build signs anyone in.

Without `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`,
any environment opens the offline sample.

## Build profiles

Profiles live in `eas.json`. The same settings work for local Xcode and Gradle
builds by exporting the profile's environment variables.

| Profile | Use | Environment | Distribution | Client |
| --- | --- | --- | --- | --- |
| `development` | Day-to-day work with Metro | `development` | Internal | Dev client, Debug |
| `development-simulator` | Same, iOS Simulator | `development` | Internal | Dev client, Debug |
| `test` / `test-simulator` | Dev client against the test backend | `test` | Internal | Dev client, Debug |
| `preview` | Internal testing on registered devices (ad hoc iOS, Android APK) | `test` | Internal | Release, JS embedded |
| `watch-testflight` | TestFlight beta of the test app | `test` | Store | Release, JS embedded |
| `production` | App Store and Google Play (AAB) | `production` | Store | Release, JS embedded |

`environment` in each profile selects the EAS environment (`development`,
`preview`, `production`) whose variables a cloud build reads.

## Versions and build numbers

- **Version** (`0.1.0`): set only in `apps/mobile/package.json`. The app
  config reads it for the iPhone app, the Watch app and Android. Raise it for
  each user-facing release.
- **Build number**: `APP_BUILD_NUMBER`, a positive whole number, default `1`.
  It becomes the iPhone `CFBundleVersion`, the Watch app's build number and
  Android `versionCode`. Raise it for every upload; App Store Connect and
  Google Play reject a number they have already seen. It was named
  `IOS_BUILD_NUMBER` until MAR-167.

The phone and Watch must carry the same version and build number, or App Store
Connect rejects the upload. `plugins/with-watch-build-number.js` and
`pnpm --filter @padelaso/mobile watch:verify-project` keep and check that
alignment after `native:generate`.

`eas.json` uses `appVersionSource: local`, so EAS reads these values from the
app config and does not count builds for you.

## Runtime policy and JavaScript updates

The app has no over-the-air updates: `expo-updates` is not installed. Every
JavaScript change reaches people in a new native build from the store, so a
JS bundle never runs on a native build it was not built with.

The app config still sets `runtimeVersion: { policy: "fingerprint" }`.
The fingerprint is a hash of everything native: dependencies, config plugins,
app config, the Watch target (`targets/`), native modules (`modules/`) and
`WatchSpike.podspec`. `fingerprint.config.js` leaves out files that only reach
the JS bundle or never ship (`src/`, tests, docs, evidence). So:

- A Swift, Watch, native module, plugin, dependency or app config change gives
  a new fingerprint. It needs a new native build and upload.
- A change under `src/` keeps the fingerprint.

If over-the-air updates are added later, they can only reach builds with the
same fingerprint. That keeps a Watch change from being mistaken for a JS
update. Check a fingerprint from `apps/mobile` with
`pnpm dlx @expo/fingerprint@0.21.9 fingerprint:generate --platform ios`.

## Credentials and settings by name

None of these belong in the repository or in `EXPO_PUBLIC_` variables.
`app.config.ts` rejects unknown public variables and any Supabase key that is
not a publishable key.

| Name | What it is | Where it lives |
| --- | --- | --- |
| `EXPO_PUBLIC_APP_ENV` | Environment above | Profile `env` in `eas.json`, or the shell |
| `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Public backend settings, shipped in the app | `apps/mobile/.env.local`, or the EAS environment |
| `APP_BUILD_NUMBER` | Build number above | Shell or EAS environment, per build |
| `APPLE_TEAM_ID` | Apple Developer team ID (not a secret) | Shell, `.env.local` or EAS environment |
| `EAS_PROJECT_ID` | Expo project UUID, only for EAS builds | Shell or EAS environment |
| Apple distribution certificate and provisioning profiles | iPhone and Watch signing | Xcode automatic signing or EAS credentials (MAR-170) |
| Android upload keystore | Google Play upload signing | EAS credentials or a password manager (MAR-171) |

## Upgrading versions

1. Raise `version` in `apps/mobile/package.json` for a new user-facing release.
2. Set `APP_BUILD_NUMBER` higher than the last uploaded build for that app ID.
3. Regenerate the native project (`native:generate --clean`), run
   `watch:verify-project`, then build with the profile you need.

## Recovery

- **"Bundle version already used" or "versionCode already used"**: raise
  `APP_BUILD_NUMBER` and rebuild. Never reuse a number.
- **Phone and Watch versions differ**: regenerate the native project, then run
  `watch:verify-project`. Don't edit the generated `ios/` project by hand.
- **App config error at build time**: the message names the setting
  (`EXPO_PUBLIC_APP_ENV`, `APP_BUILD_NUMBER`, a non-publishable key or an
  unknown public variable). Fix the variable; values are never printed.
