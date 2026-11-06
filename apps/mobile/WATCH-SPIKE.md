# MAR-44: iPhone and Apple Watch feasibility proof

This test-only prototype passed the core physical locked-phone experiment on
locally signed Release build 3; the full MAR-44 acceptance is still pending.
It adds a SwiftUI Watch app, a native iPhone setup form, and one application-level
attempt each for a score increment and an event. The normal phone screens
still show offline sample data. Check hosted results in the existing web app.

The locally signed Release build ran on the physical iPhone and paired Watch:
one score increment and one event were reconciled on the web while the owner
confirmed the iPhone remained locked. Defer TestFlight until the iOS app is
further along.
This keeps the Watch/signing/locked-phone feasibility check early without
requiring beta distribution yet. The original MAR-44 TestFlight acceptance
criterion remains pending; a local install does not complete that criterion.

## First-time setup

Start here if you only have the simulator configured:

1. In **Xcode → Settings → Accounts**, add your Apple Account. Complete sign-in
   and two-factor authentication yourself. A free **Personal Team** supports
   local on-device testing with Apple's expiry/capability limits. You do not
   need an Expo account for the local Xcode route below.
2. Pair the Apple Watch with your iPhone using Apple's Watch app. Connect the
   iPhone to the Mac over USB, unlock it and accept **Trust This Computer**.
   In Xcode 27, open **Xcode → Open Developer Tool → Device Hub** (the old
   Devices and Simulators menu is replaced). Wait for iPhone preparation to
   finish. Keep Bluetooth/Wi-Fi enabled and the Watch unlocked on your wrist.
   To pair the Watch with the Mac for development, use **Add Device (+) →
   Pair Nearby Device…** in Device Hub and select the iOS/watchOS category.
   Keep the Mac, phone and Watch on the same reachable Wi-Fi network. Follow
   the Watch's developer pairing/trust prompts; trust on both phone and Watch
   when requested. The Watch must appear as a physical Xcode run destination
   before its development provisioning can be verified.
3. For development installs, enable **Settings → Privacy & Security →
   Developer Mode** on the iPhone, and on the Watch when requested. Restart
   and confirm the prompts. This setting may appear only after beginning
   pairing in Device Hub. Install any device support requested by Xcode.
4. Select the same team for the phone and Watch targets under **Signing &
   Capabilities**, using automatic signing. Record the team ID from Xcode or
   your developer account in local `APPLE_TEAM_ID` before regeneration. Do
   not make persistent signing changes only inside the generated project.
5. To satisfy MAR-44's **TestFlight** criterion, enroll in the paid
   [Apple Developer Program](https://developer.apple.com/programs/enroll/),
   or join an existing enrolled team with app/signing/upload permissions.
   Accept Apple's agreements and create the iOS app record in App Store
   Connect with the test bundle ID. A Personal Team build is useful evidence
   but does not satisfy TestFlight acceptance.

Do not send account passwords, two-factor codes, certificates, provisioning
profiles or test tokens in chat. Account sign-in and enrollment happen in
Apple's own interfaces. Confirm the phone and Watch OS versions are supported
by the installed Xcode before building; this Watch target requires watchOS 10+.

## Ownership and versions

- Expo **58.0.23**, React Native **0.88.1**, React **19.3.0**,
  `expo-modules-core` **58.0.30**.
- `@bacons/apple-targets` **5.0.0**, its Xcode parser
  `@bacons/xcode` **1.0.0-alpha.32**. A narrow pnpm override patches the old
  plist dependency's XML parser to `@xmldom/xmldom` **0.8.15**.
- `targets/watch/`: SwiftUI app, context, HTTP client, Keychain and attempt
  ledger. `modules/watch-spike/`: Apple-only Expo module and native setup UI.
- `WatchSpike.podspec` sits at the app root to keep both source trees inside
  CocoaPods' source boundary. The phone and Watch compile the same shared
  Swift files. No hand-written native source lives solely in `ios/`.
- Keep `ios/` and `android/` disposable. Keep the pinned generation approach
  for this spike; signing/distribution is still a physical-device gate.
  Switch to owned Xcode projects only if device/distribution evidence shows
  regeneration is unreliable, with an explicit ownership-policy change first.
- `plugins/with-watch-build-number.js` aligns the phone Xcode project version
  with `ios.buildNumber`; Expo otherwise only updates the phone plist while
  the target generator uses the configured number for the Watch build setting.
- `assets/app-icon.png` is the opaque 1024px icon source. Recreate it with
  `swift scripts/generate-app-icon.swift` from this directory. Target asset
  catalogs are generated and ignored.

| Variant | Phone bundle ID | Embedded Watch bundle ID |
| --- | --- | --- |
| Development | `com.padelaso.mobile.dev` | `com.padelaso.mobile.dev.watch` |
| Test / TestFlight | `com.padelaso.mobile.test` | `com.padelaso.mobile.test.watch` |

Both targets share version `0.1.0`, build number (`IOS_BUILD_NUMBER`, default
`1`) and signing team (`APPLE_TEAM_ID`). Before the first upload, confirm the
identifiers can be registered to your team. If unavailable, change the phone
identifier in `app.config.ts`; the Watch suffix follows automatically.
No App Group, shared Keychain group, HealthKit, workout, push or background
execution entitlement is added. Each app uses its own default Keychain access
group. WatchConnectivity and foreground HTTPS do not require a custom group.

## Local generation and build

From repository root, without accounts or signing:

```bash
pnpm install --frozen-lockfile
pnpm --filter @padelaso/mobile watch:test
pnpm --filter @padelaso/mobile typecheck
pnpm --filter @padelaso/mobile lint
pnpm --filter @padelaso/mobile test
pnpm --filter @padelaso/mobile run doctor
pnpm --filter @padelaso/mobile native:generate --platform ios --clean --no-install
pnpm --filter @padelaso/mobile watch:verify-project
pnpm --filter @padelaso/mobile exec pod install --project-directory=ios
xcodebuild -workspace apps/mobile/ios/PadelasoDev.xcworkspace \
  -scheme PadelasoDev -configuration Release \
  -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath /tmp/padelaso-watch-proof CODE_SIGNING_ALLOWED=NO build
```

Use `-destination` to choose the phone platform. Do not force `-sdk
iphonesimulator` on the combined build: that overrides the Watch target's SDK.
Every generation can recreate the native directory; rerun Pod installation
afterward. To verify regeneration, hash the Swift/config/plist sources,
regenerate twice, then compare hashes and run `watch:verify-project` each time.
The verifier checks bundle binding, versions, Watch SDK and embedding rather
than unstable Xcode UUIDs. It does not verify provisioning or TestFlight.

For real devices, use the following from `apps/mobile` after configuring your
real team locally. `APPLE_TEAM_ID` and `IOS_BUILD_NUMBER` are build metadata,
not tokens. Set them in the shell or ignored `.env.local`.

```bash
export EXPO_PUBLIC_APP_ENV=test
# Set APPLE_TEAM_ID to the actual team identifier before these commands.
pnpm native:generate --platform ios --clean --no-install
pnpm watch:verify-project
pod install --project-directory=ios
open ios/PadelasoTest.xcworkspace
```

In Xcode, run the phone scheme on the trusted iPhone and the Watch scheme on
its paired Watch. Debug builds use Metro (`pnpm dev:mobile` from the repo
root). A Release build embeds JS and needs no Metro server. Use Release for
the locked-phone experiment and record which distribution actually ran.

Build the Watch scheme with the **physical Watch** selected at least once so
automatic provisioning registers the Watch, not only its companion phone.
In this run, building only for the phone initially created a Watch profile
containing just the phone UDID; installation from the iPhone Watch app returned
to **Install**. After Mac–Watch pairing and a build targeting AW11, the profile
included both UDIDs and direct Watch installation succeeded. The original
install rejection was not captured in logs, so that symptom alone is not a
definitive provisioning diagnosis.

For a command-line Watch build, set `WATCH_DEVICE_ID` to the physical Watch
identifier reported by `xcrun devicectl list devices` (not a simulator ID), then
run from `apps/mobile` with the test environment and real signing team loaded:

```bash
xcodebuild -workspace ios/PadelasoTest.xcworkspace -scheme PadelasoWatch \
  -configuration Release -destination "id=$WATCH_DEVICE_ID" \
  -allowProvisioningUpdates -allowProvisioningDeviceRegistration build
```

Rebuild the phone afterward to embed the refreshed Watch bundle/profile.
For the tested build, set `IOS_BUILD_NUMBER=3` before generation and run:

```bash
xcodebuild -workspace ios/PadelasoTest.xcworkspace -scheme PadelasoTest \
  -configuration Release -destination "id=$PHONE_DEVICE_ID" \
  -derivedDataPath /tmp/padelaso-watch-device-proof \
  -allowProvisioningUpdates -allowProvisioningDeviceRegistration build
```

Set `PHONE_DEVICE_ID` from `xcrun devicectl list devices`; keep the test
environment, build number and signing team loaded for both device builds.
Verify signatures and profile device coverage before installation. Signing and
installation are separate evidence from a successful launch on either device.

For TestFlight, select the **phone scheme**, a generic iOS device destination,
and **Product → Archive**. In Organizer, validate the archive, inspect its
embedded `Watch/PadelasoWatch.app`, and distribute to **App Store Connect**.
Automatic signing must provision both targets. For a reproducible archive:

```bash
xcodebuild -workspace ios/PadelasoTest.xcworkspace -scheme PadelasoTest \
  -configuration Release -destination 'generic/platform=iOS' \
  -archivePath /tmp/PadelasoTest.xcarchive -allowProvisioningUpdates archive
```

This command registers/provisions with the selected Apple team. Run it only
after account/device setup. Increase `IOS_BUILD_NUMBER` before each new upload.
In App Store Connect, complete processing/compliance, add yourself as an
internal tester, install via TestFlight on the iPhone, then install its Watch
companion. Record the actual processed build number and installation result.
Do not count a locally installed Debug/Release build as TestFlight evidence.

Optional EAS alternative: `eas.json` has `watch-testflight`, a store Release
profile with `developmentClient: false` and the test environment. First link a
real Expo project using EAS CLI **27.4.1** and put its UUID in local/EAS
`EAS_PROJECT_ID`; dynamic app config reads it without inventing an account.
The target plugin declares Watch credentials in `extra.eas.build.experimental
.ios.appExtensions`. Ensure `APPLE_TEAM_ID` is available during config
evaluation and in the cloud build. Then build from `apps/mobile`:

```bash
pnpm dlx eas-cli@27.4.1 build --profile watch-testflight --platform ios
```

Inspect the resulting artifact before submission. No EAS build or submission
has been initiated by this implementation.

## Provision a dedicated test match

1. Use a disposable match and preferably a test account/group on the intended
   hosted HTTPS web origin. Use the existing web Atajos/Watch token capability
   to select that match as active. The existing account token may already be
   used by Shortcuts: repoint it only with the owner's approval, and record
   the prior active match if it should be restored. This run reused the token
   with explicit approval; its prior target was not captured. Record the match
   UUID from the web URL. Do not use Supabase service-role or admin credentials.
2. In the phone app, open **Configuración → Preparar prueba del Watch**.
   Enter the HTTPS origin, token and exact UUID in the native form; confirm
   that it is a test match. The phone validates with
   `GET /api/shortcut/options` before transferring setup.
3. Open the Watch app. Send context and wait for the phone's Watch receipt.
   That receipt confirms native persistence, not a server mutation. On the
   Watch, check the origin/UUID, then **Cargar opciones**. Player/event labels
   and IDs come from the hosted options endpoint, not the phone's sample data.
4. Keep this match active throughout the experiment. The existing APIs resolve
   the token's active match at request time. The prototype checks it before
   each action and checks the response, but cannot prevent a concurrent switch
   between GET and POST. Atomic match binding belongs to MAR-46.
5. Lock/background the iPhone, choose a team and confirm **Sumar 1 juego** on
   the Watch once. Choose the player/event and confirm **Registrar evento**
   once. Verify exactly those changes in the existing web match.
6. For a dedicated disposable credential, revoke it in the web app after the
   run. If reusing the account's permanent token, coordinate cleanup with the
   owner: revocation also affects existing Shortcuts, and changing the active
   match retargets any Watch that still holds it. **Borrar configuración**
   removes phone setup and queues a Watch tombstone; wait for its receipt.
   An offline Watch may retain the token until delivery. Only server revocation
   invalidates that credential. No token revocation, target restoration or
   device cleanup was performed in this run.

Never put this token in `EXPO_PUBLIC_*`, Expo `extra`, source files, screenshots,
build logs or a PR. The native form clears its token field after queueing setup;
phone and Watch store setup in device-local Keychain with
`AfterFirstUnlockThisDeviceOnly`. WatchConnectivity carries it over Apple's
paired-device channel. This is manually provisioned test setup; production
enrollment, expiry/rotation and device revocation remain MAR-52.

Setup shows separate validation, secure-save, transfer and receipt states.
Failed validation or transfer retains the secure token field until the form is
closed; it clears only after successful queueing. Reopening the form shows
saved origin/match metadata when available and resets an old failure message.
**Reenviar configuración guardada** revalidates the saved setup before transfer.

For debugging, the phone writes only the latest stage, timestamp, allowlisted
failure/HTTP/network codes and Watch connection flags to
`Library/Caches/WatchProbeSetupDiagnostic.json` in its app data container.
No origin, token, match ID, payload, response body or raw exception is included.
This is local diagnostics, not uploaded telemetry. It can distinguish a web
rejection from inactive pairing or a Watch app that iOS does not recognize.

## Transport and loss behavior

Watch taps use native foreground `URLSession` directly to the hosted HTTPS
origin, with a Bearer header, an ephemeral cookie/cache-free session, refused
HTTP redirects, a 15s request timeout and a 20s resource timeout. The phone
JavaScript runtime and `WCSession.isReachable` are not part of mutation
delivery. WatchConnectivity transfers only the latest setup/tombstone and a
receipt; its context replacement behavior is unsuitable as an action queue.
No native phone relay is implemented; compare one only if physical evidence
shows direct HTTPS cannot meet the locked-phone requirement.

Before POST, the Watch persists an `unknown` attempt in Keychain, keyed by
origin/match/action. Only a matching successful server response changes it to
`confirmed`. Both states disable that action across relaunch and token rotation.
Errors after reservation, including timeout, decoding failure or a lost reply,
stay unknown: inspect the web match; do not resend. Preflight failures send no
mutation and permit a new preflight. There is no retry queue, offline replay,
background URLSession, optimistic score, or promise of exactly-once execution.

Deleting setup does not erase the attempt ledger. A new experiment needs a
new disposable match. A different Watch/app identity or wiped device has a
different ledger; it is not server idempotency. No durable production command
queue should be built on this mechanism. MAR-46/MAR-53 own that work.

## Physical acceptance record — partial

Use fresh disposable matches for destructive scenarios. For each case, record
phone/Watch models and OS versions, Xcode, Expo/native package versions,
processed TestFlight build, source SHA, distribution, network conditions,
match UUID, initial/final score, event count/type/player and observed result.
Screenshots must exclude credentials. Do not mark an unrun case passed.

| Scenario | Evidence required | Current result |
| --- | --- | --- |
| TestFlight install | Signed phone build embeds Watch app; physical Watch installs/launches | Deferred by owner; local development installs and launches verified |
| Context transfer | Correct UUID on Watch and matching phone receipt | Passed locally: owner report plus iPhone diagnostic receipt, stage confirmed |
| Phone backgrounded | One score increment and one event visible on web | Pending |
| Phone locked | Same proof without opening phone JS | Passed locally on build 3: owner confirmed lock state; web screenshot shows 0–0 → 1–0 and one Ace for Marcio Barrios |
| Wrist down during request | Observe completion/suspension; verify web before another action | Pending |
| Watch relaunch | Setup/attempt outcomes retained; no second POST | Pending |
| Temporary network loss before preflight | No mutation; read can be tried after reconnection | Pending |
| Loss after POST / lost response | Unknown remains disabled after relaunch; reconcile on web | Pending |
| Token revocation / active match switch | Actions rejected or preflight blocks drift; note switch race | Pending |

Local build/test results and the captured web evidence are in
[WATCH-VALIDATION.md](WATCH-VALIDATION.md). The physical run used iPhone 18 Pro /
iOS 27.0.1 and Apple Watch Series 11 / watchOS 27.0, with Personal Team
development signing, version 0.1.0 / build 3. The device run used working-tree
sources on base `faea8db`; implementation commit `5fbeb97` preserves them with
only trailing-whitespace cleanup. Wi-Fi/Bluetooth/cellular routing and wrist
state were not separately
captured; this verifies the locked-phone flow, not independent cellular use.
MAR-44 stays open until the signed physical TestFlight and hosted mutation
evidence exists. A PR containing this partial proof should say `Refs
MAR-44`, never `Fixes MAR-44`.

References: [Apple account and Personal Team limits](https://developer.apple.com/help/account/basics/about-your-developer-account),
[Developer Mode](https://developer.apple.com/documentation/xcode/enabling-developer-mode-on-a-device),
[Apple distribution](https://developer.apple.com/documentation/xcode/distributing-your-app-for-beta-testing-and-releases),
[Apple Targets](https://github.com/EvanBacon/expo-apple-targets),
[Expo target credentials](https://docs.expo.dev/build-reference/app-extensions/),
[Watch networking](https://developer.apple.com/videos/play/tech-talks/203/),
[WatchConnectivity context](https://developer.apple.com/documentation/watchconnectivity/wcsession/updateapplicationcontext(_:)).
