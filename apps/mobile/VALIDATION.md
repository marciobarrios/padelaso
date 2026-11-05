# MAR-43 validation — 5 November 2026

Implementation based on repository commit `9625daef3bcf84a1211817b6f8f1cba59704edd4`.
This is a foundation with offline sample screens. Physical-device acceptance is
still pending; MAR-43 must not be considered fully verified from bundle export.

## Checks performed

| Check | Result |
| --- | --- |
| Root frozen-lockfile install | Passed with active pnpm supply-chain policies; no new policy exceptions retained |
| Workspace lint and TypeScript checks | Passed, including web, marketing, domain and mobile |
| Workspace tests | Passed: 12 domain, 5 web and 6 mobile configuration tests |
| Workspace build | Passed with CI's non-secret local Supabase placeholders for the web app |
| Mobile native bundles | iOS and Android Hermes bundles exported with local font assets |
| `native:generate --no-install` | Both projects generated successfully without warnings |
| `expo install --check` | SDK dependency versions compatible |
| Expo Doctor 1.21.6 | 19/20 passed; native tooling check fails because CocoaPods is missing |
| Test app config | Distinct test app name, scheme, iOS bundle ID and Android package verified |
| Public settings safeguards | Tests reject secret keys, unknown public variables, non-HTTPS origins and incomplete backend settings without echoing values |
| Turbo environment caching | Verified a local `.env*` change changes the mobile build hash; temporary test file removed |
| Native-source ownership | Modules, plugins, targets and font assets remain outside ignored generated projects |

The first root build without web environment variables failed in the existing
web Supabase client. The successful build used:

```bash
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 \
NEXT_PUBLIC_SUPABASE_ANON_KEY=local-test-anon-key \
SUPABASE_SERVICE_ROLE_KEY=local-test-service-role-key \
pnpm build
```

These are the existing CI placeholders, not hosted credentials. No hosted
backend was contacted or modified. Settings report configuration shape only;
account connection and backend connectivity are outside these sample screens.

## Validation still required

- Native IPA/APK compilation and installation: CocoaPods is unavailable; the
  Android device service reports **Unable to locate a Java Runtime**.
- Physical iPhone and Android emulator/device smoke test: the device service
  returned **no devices**. No screen rendering, navigation, accessibility,
  font failure or physical signing result is claimed.
- Database pgTAP / complete `pnpm check`: Docker is unavailable on this host.
  Existing migrations and database code were not changed.
- EAS project linking, signing credentials and cloud builds have not been
  configured or submitted. `eas.json` contains development-client profiles;
  setup steps are in the README. Watch signing/target proof remains MAR-44.

## Dependency audit follow-up

`pnpm audit --json` reports **4 critical, 42 high, 67 moderate and 10 low**
advisories. A second audit of the original HEAD lockfile returned identical
advisory IDs and counts. This change introduces no new advisory IDs, but it
adds mobile tool paths to dependencies already reported in the baseline.
This is not a clean security audit or production-release approval.

High-severity mobile paths observed:

| Package | Installed version | Reachable through |
| --- | --- | --- |
| `ws` | 8.20.0 | Expo CLI / development tunnel |
| `brace-expansion` | 5.0.5 | Expo CLI / glob matching |
| `js-yaml` | 4.1.1 | Expo CLI / Xcode output tooling |
| `browserslist` | 4.28.2 | Babel / native build transforms |
| `source-map-js` | 1.2.1 | Metro configuration / PostCSS |
| `zod` | 4.3.6 | ESLint React Hooks tooling |

The listed mobile paths are development/build/lint tools, rather than imports
from the sample app's runtime source. That assessment is based on audit paths
and source imports, not an exploit reproduction. Baseline critical findings
also include Next.js 16.3.5 and `proxy-addr` through the web shadcn tooling.
They are deferred from this native-workspace change to a dedicated dependency
remediation pass to avoid unrelated framework and tooling upgrades.
Review by **12 November 2026**, and before any release. Re-run the audit,
review upstream fixes and verify affected web/native workflows when upgrading.
