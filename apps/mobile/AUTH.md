# Native authentication — MAR-47

## Flows and account identity

Google uses `supabase.auth.signInWithOAuth` in the platform authentication browser
(`ASWebAuthenticationSession` on iOS, browser/Custom Tabs on Android), with PKCE
and the existing Supabase project/provider. The native crypto bridge supplies
secure random values and SHA-256 so auth-js never falls back to plain PKCE.
Only a one-use authorization code is accepted at the callback; implicit token
fragments, other schemes, malformed callbacks and expired attempts are rejected.
The PKCE verifier and ten-minute attempt record survive process termination.
Warm Linking events and browser results share one exchange operation.

Apple uses `expo-apple-authentication`, its official native button, a fresh nonce
(SHA-256 to Apple, raw nonce to Supabase), and `signInWithIdToken`. Only email is
requested. A name is not required or used to infer account identity.

Sign in to the **original account first**, then use Configuración to explicitly
link another provider with `linkIdentity`. The returned user ID must match the
authenticated owner. Linking never falls back to sign-in or an application-side
merge. Supabase controls its own verified-email automatic identity linking;
the app does not merge names, similar emails, players or memberships. Apple's
private relay email may differ from Google: the login and account screens explain
how to return to the original account and link from there. An already-owned
identity requires recovery of that original account; no history is moved.

Groups and player associations remain keyed by the existing `auth.users.id`.
The app does not create replacement player/profile rows or overwrite profile
metadata during sign-in. Native group/player editing remains MAR-49 scope.

## Storage and lifecycle

- iOS: SecureStore/Keychain, `WHEN_UNLOCKED_THIS_DEVICE_ONLY`; Android:
  SecureStore encrypted storage backed by Android Keystore, with its config
  plugin's backup exclusions. No biometric prompt interrupts token refresh.
- Session, verifier and pending-link keys are namespaced by environment and
  backend host. No access/refresh tokens, provider tokens or raw errors are logged.
- Values are URI-encoded into ASCII chunks smaller than 2 KiB, with a final
  manifest commit. This accommodates large identity metadata. Writes/readers are
  serialized; a missing chunk or interrupted write cannot expose a partial token.
  Interrupted writes can require signing in again. There is no plaintext fallback.
- Sign-out clears chunks, verifier, pending destination and user navigation state.
  A durable signed-out marker prevents restoring credentials after interruption.
  If remote revocation cannot be confirmed offline, local credentials are still
  removed and the UI says so. It does not claim global account revocation.
- SecureStore on iOS may survive uninstall; uninstall is not a sign-out mechanism.
  Sign out explicitly on shared devices. Android uninstall removes local keys.
- Session restoration and foregrounding call Auth `getUser` before exposing user
  screens. Network failures show a retry/sign-out state; revoked sessions require
  sign-in. Auto-refresh runs only in the foreground. Auth callbacks do not await
  Supabase operations inside `onAuthStateChange`'s lock.
- User routes remount on account changes/sign-out. Reads abort on unmount and
  discard late results. There is no persistent group/match cache shared by users.
  The independent MAR-44 Watch test form is available only in offline sample mode;
  these user sessions are not sent to that prototype. Watch credential lifecycle
  remains MAR-52 scope.

## Provider setup

The ignored `.env.local` in this worktree uses the existing **Padelaso** project,
`avznvjohrzroiskkypwf`, as explicitly requested. Only its public URL and
`sb_publishable_…` key enter the app. Never copy web/server env files.

1. In Supabase Authentication → URL Configuration, **append** these exact
   redirects, preserving the web site URL and all existing redirects:
   - `padelaso-dev://auth/callback`
   - `padelaso-test://auth/callback`
2. Keep the existing Google provider/client configuration. The Google Cloud
   authorized redirect remains the Supabase HTTPS `/auth/v1/callback` URL; the
   custom mobile schemes belong in Supabase's redirect allowlist. This browser
   flow needs no Google client secret in the app or Android SHA registration.
3. Enable manual identity linking in Supabase Auth settings. If it is disabled,
   linking must fail with recovery guidance; do not substitute a new sign-in.
4. For Apple, register the app identifiers `com.padelaso.mobile.dev` and
   `com.padelaso.mobile.test` with Sign in with Apple enabled in the Apple
   Developer account; use matching signing/provisioning for physical builds.
   Enable Apple in Supabase and append these bundle IDs to the allowed client ID
   list, preserving any existing IDs. Keep nonce verification enabled. This
   native ID-token flow does not require an Apple browser Services ID or a private
   Apple OAuth signing key in the app. Distribution/team setup remains required.
5. Rebuild the native development client after dependency/config changes.
   `expo prebuild` generates the entitlement, callback schemes and SecureStore
   configuration from committed config; do not edit disposable native projects.

Local `supabase/config.toml` includes the two callbacks and manual linking. It
does **not** update hosted settings. Avoid pushing the entire local config to the
shared project: its local site URL and unrelated values are not production values.

Hosted setup was applied on 9 November 2026 using the authenticated Supabase CLI.
Both mobile callbacks are allowlisted, manual linking is enabled, and Apple is
enabled with the development/test bundle IDs as accepted audiences. The six
existing web redirects and twelve unrelated remote settings were preserved.
A fresh CLI diff found no remaining differences for the declared Auth fields;
public `/auth/v1/settings` now reports both Google and Apple enabled. Apple's
app identifiers/capabilities and physical provisioning still need to be checked
in the Apple Developer account before real-device sign-in validation.

The CLI's automatic browser login established management access without a
manually created token. In agent environments it must run in interactive text
mode: `pnpm exec supabase login --no-browser --output-format text --agent no`.
The browser authorization page returns a verification code for the waiting CLI.
The change used pull/diff/push against an isolated minimal config rather than
the repository's local-development config. Only the mobile redirects, manual
linking and Apple provider fields were declared. The CLI also sent Apple's
`email_optional = false` schema default as part of its provider-group update.

## Deep links

Only the build's scheme is accepted. Supported destinations are
`padelaso-dev://matches/<UUID>` and `padelaso-dev://join/<invite-code>` (or the
test scheme). Pending destinations survive authentication/cancellation and
process restart. A match is fetched with the authenticated client and RLS;
a valid UUID alone grants no access. An invite is displayed after sign-in and
requires **Aceptar invitación**; only the existing `join_group_by_code` RPC can
authorize membership. No automatic mutation retries are added. Sign-out clears
the destination to prevent carrying it into another account.

## Review and device acceptance

The implementation uses Apple's native sign-in control as the iOS equivalent
login option. Review guideline 4.8 and privacy disclosures apply. In-app account
deletion is tracked separately in MAR-48 and must be completed before release;
this development build is not a claim of App Store readiness.

Automated coverage includes Unicode/large-session persistence, interrupted
storage, S256 PKCE with the pinned SDK, cold/warm/duplicate/expired callbacks,
provider cancellation, same-owner linking, conflict recovery, revoked sessions,
foreground refresh, sign-out tombstones and stale account responses.

Validation on this worktree (9 November 2026):

| Check | Result |
| --- | --- |
| Mobile auth/config tests | 31 passed, including pinned-SDK PKCE and new-client session restoration |
| Workspace lint, typecheck and tests | Passed; auth checks rerun after final lifecycle fixes |
| Expo dependency compatibility | Passed |
| iOS/Android Hermes exports | Passed |
| iOS/Android native generation | Passed |
| Apple entitlement / Android SecureStore backup exclusions | Present in generated projects |
| Watch target embedding verifier | Passed |
| iOS Simulator Debug build | Passed with Xcode 27.2 and ad-hoc simulator signing; unsigned builds cannot access Keychain |
| iOS installation | Installed in the existing iPhone 18 Pro simulator |
| iOS interaction | Resumed after the device became available: app launch, Google system-browser login page, cancellation recovery, rejected callback and protected pending match link observed; pending link survived app termination/relaunch |
| iOS Apple flow | Native button opens the system Apple Account prompt; the simulator requires an Apple Account signed in through Settings before credentials can be issued |
| iOS collapsed developer overlay | Reproduced a blank screen while accessibility still exposed the app/OAuth content. Hiding Expo's floating Tools button immediately revealed that content. iOS development builds now hide this button through the public development-client API; normal cold launch and developer-menu open/close were visually checked |
| Android Debug build | Passed: 499 tasks executed. Gradle and JDK 17 were downloaded from official sources and checksum-verified; JDK 17 is installed in the user's JavaVirtualMachines directory |
| Android installation and launch | APK installed and app opened on Pixel 10 / Android 17 emulator; connected to Metro after granting the development client's local-network permission |
| Android Google flow | Live Google credential-entry page opened in the system browser; closing the tab returned the Spanish cancellation/retry state |
| Android pending invite | An unauthenticated invite opened the sign-in screen with the saved-link notice; the notice survived app termination/relaunch |
| Android invalid callback | Rejected with the Spanish expired/invalid-link message while preserving the pending invitation |
| Existing-account sign-in and group display | User confirms their two existing groups are visible after signing in on both Android and iOS Simulator |
| iOS identity and data preservation | Native authenticated getUser and RLS reads match the original backend user ID, Google identity ID, two membership IDs/roles and two player IDs/group associations; only whitelisted identifiers were inspected |
| iOS process restoration | User confirms both groups return after fully quitting and reopening Padelaso Dev without another Google login |
| iOS live token refresh | The native SDK refreshed against hosted Auth: access token changed, expiry advanced and getUser verified the same original account; credentials stayed inside the native runtime |
| iOS scoped revocation | Hosted Auth accepted revocation of only the simulator session while cached native credentials remained present; quit/reopen detection is awaiting the user result |
| Physical iPhone provisioning | Paired iPhone and development signing identity found. Xcode rejected provisioning because the available Personal Team does not support Sign in with Apple. User confirms only a free Personal Team is available; no physical auth result is claimed |
| Live provider settings | Google and Apple enabled; verified against public Auth settings after the CLI push |
| Hosted callback/linking changes | Applied through Supabase CLI: both callbacks, manual linking and native Apple audiences; fresh diff has zero declared differences and preserves all twelve unrelated settings |

Agent-driven iOS and Android checks reached Google's credential-entry page
without entering account credentials. The user subsequently completed sign-in
and confirmed their two existing groups appear on both platforms. Exact
identity, membership and player preservation, process restoration and hosted
refresh are now verified for iOS Simulator. The Android exact-ID comparison,
Apple account exchange, hosted revocation and live provider linking remain
unverified. Physical acceptance is blocked by Personal Team provisioning for
Sign in with Apple; it requires an enrolled Apple Developer team.

Simulator builds that exercise SecureStore must retain code signing. The first
unsigned build failed with `A required entitlement is not present`; rebuilding
with `CODE_SIGNING_ALLOWED=YES CODE_SIGN_IDENTITY=- CODE_SIGNING_REQUIRED=YES`
resolved Keychain access. Use the normal Expo/Xcode simulator build or these
overrides with `xcodebuild`, not `CODE_SIGNING_ALLOWED=NO`, for auth testing.

On the current SDK 58/iOS 27 simulator, Expo's collapsed floating Tools window
can obscure both the app and the system OAuth sheet. The root layout disables
the floating button only in iOS development builds. The developer menu remains
available through Cmd+D or the simulator's shake command. Android and release
builds do not execute this workaround. Accessibility snapshots alone did not
reveal this occlusion; verify actual screenshots with the menu closed as well.

Before MAR-47 can close, record **real** iOS and Android evidence for:

- Compare the existing Google user, membership and player IDs after Android
  sign-in; the exact iOS comparison passed and group display is user-confirmed
  on both platforms.
- New Google and Apple users, Apple private relay, cancellation and provider errors.
- Same-account linking with different emails; already-owned identity recovery.
- Cold/warm callbacks, termination during OAuth, replay rejection, and pending links.
- Process termination/restoration, token expiry/refresh, revoked sessions and offline retry.
- Sign-out/account switch while data is loading, plus unauthorized match and invalid invite.
- VoiceOver/TalkBack, large text, and native Apple/Google provider interaction.

Passing unit tests, native generation and JS bundle export do not establish these
live acceptance criteria. Use `Refs MAR-47` for a PR until the required evidence
and hosted setup are complete.

References checked during implementation:
[Supabase Expo social auth](https://supabase.com/docs/guides/auth/quickstarts/with-expo-react-native-social-sign-in),
[identity linking](https://supabase.com/docs/guides/auth/auth-identity-linking),
[Expo Apple authentication](https://docs.expo.dev/versions/latest/sdk/apple-authentication/),
[SecureStore](https://docs.expo.dev/versions/latest/sdk/securestore/),
[Expo protected routes](https://docs.expo.dev/router/advanced/authentication/),
[Apple review guidelines](https://developer.apple.com/app-store/review/guidelines/#login-services).
