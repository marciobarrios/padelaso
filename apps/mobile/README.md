# Padelaso mobile

Native iOS/Android foundation for MAR-43. Expo Router screens consume
`@padelaso/domain` directly: sample match teams, set wins and event labels.
No Next.js components, server routes or web environment files are imported.
The current screens use offline sample data, including when a backend is
configured. Authentication and real data access belong to MAR-47/MAR-45.

The MAR-44 feasibility prototype adds an Apple Watch companion and a native
test setup form in **Configuración**. See [WATCH-SPIKE.md](WATCH-SPIKE.md) for
first-time Apple account/device setup, signing and TestFlight instructions.
The locally signed build passed the locked-iPhone scoring/event experiment.
See [WATCH-VALIDATION.md](WATCH-VALIDATION.md) for captured evidence and the
remaining TestFlight (MAR-55) and resilience/accessibility checks (MAR-56).
MAR-44's revised local feasibility scope is complete.

## Pinned toolchain

- Expo SDK **58.0.23**, React Native **0.88.1**, React **19.3.0**
- Expo Router **58.0.30**, TypeScript **6.0.3**
- Node **22.13+** (use the latest Node 22 LTS patch), pnpm **11.20.0**
- Optional EAS CLI **27.4.1**, invoked with `pnpm dlx eas-cli@27.4.1`

Expo selects mobile React/native versions independently of the web apps.
Use `expo install` when adding native dependencies; pin the resulting versions,
commit the root lockfile and run the dependency check below. Metro uses
`expo/metro-config` with automatic pnpm monorepo support; keep pnpm's isolated
linker. Do not add global React overrides to align mobile with Next.js.

## Clean checkout

Run from the repository root:

```bash
pnpm install --frozen-lockfile
cp apps/mobile/.env.example apps/mobile/.env.local
pnpm --filter @padelaso/mobile run doctor
pnpm --filter @padelaso/mobile typecheck
pnpm --filter @padelaso/mobile test
```

Blank backend fields are intentional: the sample requires no accounts or
network access. The guide below compiles an app containing `expo-dev-client`;
Expo Go is not the development workflow.

## iOS toolchain and development build

Use macOS with Xcode **26.4+**, its command-line tools, and a compatible iOS
Simulator runtime installed through **Xcode → Settings → Components**.
Select Xcode in **Settings → Locations → Command Line Tools**, accept its
license and finish first-launch component installation. Install CocoaPods
(e.g. `brew install cocoapods`) and verify `pod --version`. The phone/simulator
must run iOS **16.4+**.

```bash
# Compile a Debug development client and install on a selected simulator.
pnpm mobile:ios --device
# In later sessions, start Metro for the already installed client.
pnpm dev:mobile
```

Select an installed iOS simulator in the device picker. The first build
creates the native project and installs Pods. Open the installed **Padelaso
Dev** client and connect to Metro. To build a physical iPhone, connect and
trust it over USB, enable Developer Mode in iOS Settings, add your Apple
account in Xcode, then use the same `--device` picker and select the phone.
Expo/Xcode prompts for the signing team. Personal-team signing can be used
for local development; distribution uses an appropriate paid Apple team.
Allow local network access and keep phone and Mac on the same reachable LAN.
When LAN access is blocked, run
`pnpm --filter @padelaso/mobile dev --tunnel` (Expo may request its tunnel helper).

## Android toolchain and development build

Install Android Studio, **JDK 17**, Android SDK Platform **37**, SDK Build-Tools,
Platform-Tools, Command-line Tools and Android Emulator. Accept SDK licenses.
SDK 58 compiles against API 37 and targets API 36. Create a virtual device in
Android Studio's **Device Manager** with an image matching the host CPU
(arm64 on Apple Silicon); Android 7/API 24 is the minimum supported OS.

On macOS, add the following to your shell configuration using your actual SDK
and JDK install locations:

```bash
export JAVA_HOME=$(/usr/libexec/java_home -v 17)
export ANDROID_HOME="$HOME/Library/Android/sdk"
export PATH="$PATH:$ANDROID_HOME/emulator:$ANDROID_HOME/platform-tools"
java -version
adb version
```

Start the emulator from Device Manager, then run from the repository root:

```bash
pnpm mobile:android
pnpm dev:mobile
```

For a physical Android phone, enable Developer Options and USB debugging,
connect via USB, accept the debugging authorization and run
`pnpm mobile:android --device`. Select the phone. Use the development client
launcher to connect to Metro; over USB, `adb reverse tcp:8081 tcp:8081` can
forward Metro. A hosted HTTPS backend avoids emulator/phone localhost
addressing differences.

## Development/test settings

Only these public names are supported in `apps/mobile/.env.local`:

| Name | Values |
| --- | --- |
| `EXPO_PUBLIC_APP_ENV` | `development` (default) or `test` |
| `EXPO_PUBLIC_SUPABASE_URL` | HTTPS origin of a non-production backend, or blank |
| `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Corresponding `sb_publishable_…` client key, or blank |

Set both backend fields or neither. Use a separate test project for shared
QA; use a development project for developer work. Settings checks URL/key
shape and shows a generic Spanish error for incomplete/invalid configuration.
It does not verify backend connectivity. Configuration never displays keys or
raw exceptions. Client keys are public by design; server authorization/RLS
still controls access. This foundation intentionally accepts publishable keys
rather than legacy JWT keys. Do not copy `apps/app/.env.local`: server secrets,
service-role keys and privileged API/Shortcuts tokens must stay on the server.
Never prefix a secret with `EXPO_PUBLIC_`, put it in app config `extra`, or
include it in mobile source. Build config rejects unknown public variable
names and non-publishable keys before bundling.

Test builds have a different app name, bundle/package identifier and URL scheme
(`com.padelaso.mobile.test`, `padelaso-test`) from development builds
(`com.padelaso.mobile.dev`, `padelaso-dev`), so both can coexist. To switch a
local native build, change `EXPO_PUBLIC_APP_ENV`, regenerate the native project
and rebuild; stop/restart Metro with the same environment. Environment labels
do not prove which backend you selected: verify the URL belongs to the intended
non-production project before setting it. Do not use `NODE_ENV` to select a backend.

## Optional cloud development builds

Local compilation needs no Expo account. For EAS, run the commands from
`apps/mobile`; the first setup links an Expo project and stores its real ID in
app config. This repository does not invent a project ID or signing credentials.

```bash
pnpm dlx eas-cli@27.4.1 login
pnpm dlx eas-cli@27.4.1 init
pnpm dlx eas-cli@27.4.1 build --profile development-simulator --platform ios
pnpm dlx eas-cli@27.4.1 build --profile development --platform android
# Signed iPhone development client (registered devices and Apple team required):
pnpm dlx eas-cli@27.4.1 device:create
pnpm dlx eas-cli@27.4.1 build --profile development --platform ios
```

`test` and `test-simulator` use EAS's `preview` environment and select the test
app identifiers. Set the matching public URL/key in the EAS `development` or
`preview` environment before building. Local env files are excluded from EAS
uploads; no privileged credentials belong in either public environment. Every
profile includes the development client. After installing the downloaded build,
start Metro with `pnpm dev:mobile`. Store/release automation is MAR-55 scope.

## Native source ownership

`ios/` and `android/` are ignored, disposable generated projects. Always keep
hand-written sources outside them:

- `modules/`: app-owned Expo modules, Swift/Kotlin and module configuration
- `plugins/`: Expo config plugins and templates for generated-project changes
- `targets/`: Watch target, Swift source and shared native probe code (MAR-44)

Create a module with `pnpm dlx create-expo-module@latest --local` from this app
directory; commit its complete source/configuration. Expo autolinks local
modules under `./modules`. Native changes require a new development client.

```bash
# From repository root. --no-install validates generation without native tools.
pnpm --filter @padelaso/mobile native:generate --no-install
# After native config/dependency changes, once hand-written sources are protected:
pnpm --filter @padelaso/mobile native:generate --clean
pnpm mobile:ios --device
pnpm mobile:android --device
```

Never make the only copy of a Swift file or Watch target inside `ios/`.
If MAR-44 chooses to maintain Xcode projects instead, it must change this
ownership/ignore policy before manual project changes are made.

## Checks and smoke test

Root `lint`, `typecheck`, `test`, `build` and `check` discover this workspace.
Local `.env*` files and supported public process variables participate in the
mobile bundle cache hash, so backend/environment changes invalidate the cache.
Mobile `build` exports **both native JS bundles and assets** into `dist/`; it
requires no signing or native SDK. It does not compile an IPA/APK. Use
`mobile:ios`/`mobile:android` or EAS for native compilation. Web development
still defaults to the product; `dev:all` also starts Metro.

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm --filter @padelaso/mobile run doctor
pnpm --filter @padelaso/mobile exec expo config --type public
# Optional deeper native dependency/project checks:
pnpm --filter @padelaso/mobile exec pnpm dlx expo-doctor@1.21.6
```

On a physical iPhone and Android emulator/device, verify:

1. Launch the installed development client and open Metro's project.
2. Home shows the sample teams and domain-derived **2 – 1** result.
3. **Ver partido** opens three sets and domain event labels; native Back works.
4. **Configuración** shows the selected environment and sample/backend status.
5. Check large system text, VoiceOver/TalkBack labels, scrolling and safe areas.
6. Open an unknown match (e.g. `padelaso-dev://matches/unknown`) and confirm the
   Spanish fallback and **Volver a partidos** navigation.
7. Reopen/reload the client; verify font loading and readable system-font fallback.

Record actual device/OS/build results. Bundle export and project generation
alone do not satisfy the physical-device smoke-test acceptance criterion.

References: [monorepos](https://docs.expo.dev/guides/monorepos/),
[development builds](https://docs.expo.dev/develop/development-builds/introduction/),
[SDK compatibility](https://docs.expo.dev/versions/latest/),
[local native modules](https://docs.expo.dev/modules/get-started/),
[public environment variables](https://docs.expo.dev/guides/environment-variables/).

Current checks and remaining device gates are recorded in [VALIDATION.md](VALIDATION.md).
