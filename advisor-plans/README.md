# Padelaso improvement audit

Reviewed 2026-09-11 against commit [`095b356`](https://github.com/marciobarrios/padelaso/commit/095b356ab5106168599e348bd7984bfddaa1a7cb).

Source code was not modified. This report lives in `advisor-plans/` because `plans/` already contains an unrelated native-app proposal. No implementation plans have been selected or written.

**Assessment**

The strongest improvements are authorization and mutation integrity, followed by reducing redundant data loading. The monorepo/domain split, parallel server queries, request-local React cache, dynamic dialog imports, and atomic score-increment RPC are useful foundations worth retaining. A framework or state-management rewrite is not justified by this audit.

Effort: S = hours; M = roughly a day; L = several days, including relevant verification. Risk describes implementing the change, not the severity of the current defect. Confidence is based on inspected code; deployed database state was not inspected.

**Prioritized findings**

| # | Finding | Category | Impact | Effort | Fix risk | Confidence |
|---|---|---|---|---|---|---|
| 1 | Close the direct membership insertion gap | Security | High | M | Medium | High |
| 2 | Update the vulnerable Next.js dependency | Dependencies / security | High | S–M | Medium | High |
| 3 | Authorize and complete player deletion atomically | Correctness / data integrity | High | M | Medium | High |
| 4 | Add a behavioral verification baseline | Tests / tooling | High | M | Low | High |
| 5 | End Shortcut access when group membership ends | Security | High | M | Low | High |
| 6 | Fetch only the datasets each page uses | Performance / architecture | High | S | Low | High |
| 7 | Use one freshness policy for hydrated matches | Performance / caching | Medium | S | Medium | High |
| 8 | Make match creation atomic and safe to retry | Correctness / efficiency | High | M | Medium | High |
| 9 | Distinguish failed reads from empty data | Correctness / resilience | High | M | Low | High |
| 10 | Seed auth and group providers with server state | Performance / loading quality | Medium | M | Medium | High |
| 11 | Bound history reads and use compact event aggregates | Performance / scalability | Medium, increasing with history | M–L | Medium | High |
| 12 | Let the fourth participant cast a first vote | Correctness | Medium | S | Low | High |
| 13 | Make populated-group deletion match its confirmation text | Correctness | Medium | M | Medium | High |
| 14 | Apply the selected period to MVP statistics | Correctness / statistics | Medium | S | Low | High |

**1. Close the direct membership insertion gap**

Evidence: [supabase/migrations/20250401000000_groups.sql:101](https://github.com/marciobarrios/padelaso/blob/095b356ab5106168599e348bd7984bfddaa1a7cb/supabase/migrations/20250401000000_groups.sql#L101) checks only that the new membership's user ID equals the authenticated user. The admin helper at [supabase/migrations/20250401000000_groups.sql:46](https://github.com/marciobarrios/padelaso/blob/095b356ab5106168599e348bd7984bfddaa1a7cb/supabase/migrations/20250401000000_groups.sql#L46) trusts the supplied role; the intended invite validation is separate at line 150. All nine migrations were reviewed; none removes this policy.

Impact: Under the repository's policies, a signed-in user who knows a group ID can join without its invite code and assign themselves admin privileges. That membership then authorizes access to group data and administration.

Improvement: Remove permissive direct membership insertion and keep membership creation in authorized create/join operations with server-controlled roles. Verify valid invitations, invalid invitations, outsiders, members, and admins. Risk: accidentally blocking legitimate group creation or joining.

**2. Update the vulnerable Next.js dependency**

Evidence: [apps/app/package.json:22](https://github.com/marciobarrios/padelaso/blob/095b356ab5106168599e348bd7984bfddaa1a7cb/apps/app/package.json#L22) and [apps/marketing/package.json:16](https://github.com/marciobarrios/padelaso/blob/095b356ab5106168599e348bd7984bfddaa1a7cb/apps/marketing/package.json#L16) pin Next.js 16.2.2; the lockfile agrees. The app exposes a Server Function at [apps/app/src/lib/server-actions.ts:12](https://github.com/marciobarrios/padelaso/blob/095b356ab5106168599e348bd7984bfddaa1a7cb/apps/app/src/lib/server-actions.ts#L12).

Impact: The official GHSA-q4gf-8mx6-v5v3 advisory lists Next.js 16.0 through versions before 16.2.3 as affected by a high-severity React Server Components denial-of-service issue. Repository dependency exposure is confirmed; production deployment versions and provider mitigations were not inspected. [Official Next.js advisory](https://github.com/vercel/next.js/security/advisories/GHSA-q4gf-8mx6-v5v3)

Improvement: Upgrade both workspaces to a supported patched release, align eslint-config-next, and rerun application verification. Version 16.2.3 fixes this specific advisory; choose the target against the complete current advisory list rather than treating it as a generally safe target. Risk: framework behavior changes affecting routing, authentication, and Server Actions.

**3. Authorize and complete player deletion atomically**

Evidence: [apps/app/src/app/players/[playerId]/content.tsx:142](https://github.com/marciobarrios/padelaso/blob/095b356ab5106168599e348bd7984bfddaa1a7cb/apps/app/src/app/players/%5BplayerId%5D/content.tsx#L142) shows Delete without a creator check. [apps/app/src/lib/supabase-mutations.ts:128](https://github.com/marciobarrios/padelaso/blob/095b356ab5106168599e348bd7984bfddaa1a7cb/apps/app/src/lib/supabase-mutations.ts#L128) removes the player from match teams before deleting the player. Match updates allow group members at [supabase/migrations/20260521000000_open_match_management_to_group.sql:9](https://github.com/marciobarrios/padelaso/blob/095b356ab5106168599e348bd7984bfddaa1a7cb/supabase/migrations/20260521000000_open_match_management_to_group.sql#L9), but player deletion remains creator-only at [supabase/migrations/20250401000000_groups.sql:275](https://github.com/marciobarrios/padelaso/blob/095b356ab5106168599e348bd7984bfddaa1a7cb/supabase/migrations/20250401000000_groups.sql#L275).

Impact: A noncreator using the normal Delete control can remove a player's historical match participation while the final player deletion affects zero rows. Update errors and affected-row counts are not checked. Failures between writes also leave partial changes.

Improvement: Authorize before any data changes and perform cleanup plus deletion in one transaction. Match UI permissions to the database rule and return an explicit outcome. Verify unauthorized and failed operations leave all history unchanged. Risk: historical data removal and ranking changes.

**4. Add a behavioral verification baseline**

Evidence: [package.json:13](https://github.com/marciobarrios/padelaso/blob/095b356ab5106168599e348bd7984bfddaa1a7cb/package.json#L13) runs lint, typecheck, and build only. [packages/domain/package.json:12](https://github.com/marciobarrios/padelaso/blob/095b356ab5106168599e348bd7984bfddaa1a7cb/packages/domain/package.json#L12) and [apps/app/package.json:5](https://github.com/marciobarrios/padelaso/blob/095b356ab5106168599e348bd7984bfddaa1a7cb/apps/app/package.json#L5) define no behavioral test tasks. The inventory has no domain/app test suite or checked-in GitHub Actions workflow. [apps/app/shortcuts/validate-template.mjs:1](https://github.com/marciobarrios/padelaso/blob/095b356ab5106168599e348bd7984bfddaa1a7cb/apps/app/shortcuts/validate-template.mjs#L1) is a useful, narrowly scoped exception.

Impact: The normal check command cannot detect the voting, deletion, or partial-save failures identified here. Shared ranking and scoring behavior can change without a regression signal.

Improvement: Add focused tests for outcomes, ties, streaks, ranking eligibility, and score deltas; component coverage for voting; and database integration checks for membership policies, atomic mutations, and concurrent scoring. Include those in check and CI. This is a prerequisite for broad persistence or caching changes, not a reason to delay urgent security fixes.

**5. End Shortcut access when group membership ends**

Evidence: [apps/app/src/lib/supabase-mutations.ts:70](https://github.com/marciobarrios/padelaso/blob/095b356ab5106168599e348bd7984bfddaa1a7cb/apps/app/src/lib/supabase-mutations.ts#L70) deletes membership without clearing token pointers. [supabase/migrations/20260904174316_stable_score_tokens.sql:58](https://github.com/marciobarrios/padelaso/blob/095b356ab5106168599e348bd7984bfddaa1a7cb/supabase/migrations/20260904174316_stable_score_tokens.sql#L58) authorizes the stored token and match pointer without checking current membership. [apps/app/src/app/api/_token.ts:93](https://github.com/marciobarrios/padelaso/blob/095b356ab5106168599e348bd7984bfddaa1a7cb/apps/app/src/app/api/_token.ts#L93) accepts that pointer, and [apps/app/src/app/api/score/route.ts:54](https://github.com/marciobarrios/padelaso/blob/095b356ab5106168599e348bd7984bfddaa1a7cb/apps/app/src/app/api/score/route.ts#L54) writes with the administrative client.

Impact: A previously activated Shortcut can keep modifying its active match after the owner leaves the group. Browser access policies and token API access then disagree.

Improvement: Check current membership during token authorization and reject or deactivate unauthorized match pointers. Clear relevant pointers when membership ends and cover all Shortcut endpoints. Preserve stable tokens for legitimate members. Risk is limited to denying access that is no longer authorized.

**6. Fetch only the datasets each page uses**

Evidence: [apps/app/src/lib/server-data.ts:37](https://github.com/marciobarrios/padelaso/blob/095b356ab5106168599e348bd7984bfddaa1a7cb/apps/app/src/lib/server-data.ts#L37) always loads matches, players, events, and votes; [apps/app/src/lib/server-data.ts:85](https://github.com/marciobarrios/padelaso/blob/095b356ab5106168599e348bd7984bfddaa1a7cb/apps/app/src/lib/server-data.ts#L85) invokes that loader during group resolution. [apps/app/src/app/players/page.tsx:11](https://github.com/marciobarrios/padelaso/blob/095b356ab5106168599e348bd7984bfddaa1a7cb/apps/app/src/app/players/page.tsx#L11) consumes players only. Home and the match list consume only matches and players.

Impact: Every players-page server render performs three unused data queries. Home and the match list each perform two. All four queries are awaited, so even an unused slow query delays the page.

Improvement: Separate auth/group resolution from data fetching and use route-specific loaders. Preserve group authorization and request-local deduplication. This reduces the players page's group-data queries from four to one; no latency percentage is claimed.

**7. Use one freshness policy for hydrated matches**

Evidence: [apps/app/src/lib/swr-hydration.tsx:40](https://github.com/marciobarrios/padelaso/blob/095b356ab5106168599e348bd7984bfddaa1a7cb/apps/app/src/lib/swr-hydration.tsx#L40) supplies prefetched data, disables stale revalidation, and sets 60-second deduplication. [apps/app/src/lib/supabase-hooks.ts:166](https://github.com/marciobarrios/padelaso/blob/095b356ab5106168599e348bd7984bfddaa1a7cb/apps/app/src/lib/supabase-hooks.ts#L166) overrides this for matches with zero deduplication and unconditional mount revalidation.

Impact: Mounting a match-list consumer starts another query even when the server just prefetched the same data. The hook also removes the configured deduplication window.

Improvement: Keep available data visible during background validation and reconcile mount revalidation with explicit mutation invalidation. Verify cold loading, returning from scorekeeping/editing, and updates from other clients before removing any freshness checks. Risk: stale scores if invalidation remains incomplete.

**8. Make match creation atomic and safe to retry**

Evidence: [apps/app/src/lib/supabase-mutations.ts:177](https://github.com/marciobarrios/padelaso/blob/095b356ab5106168599e348bd7984bfddaa1a7cb/apps/app/src/lib/supabase-mutations.ts#L177) inserts a match, then separately inserts events at line 191. [apps/app/src/components/match/match-wizard.tsx:109](https://github.com/marciobarrios/padelaso/blob/095b356ab5106168599e348bd7984bfddaa1a7cb/apps/app/src/components/match/match-wizard.tsx#L109) and line 130 have no pending guard; the Save button at line 437 remains enabled. Token repointing at line 144 is another failure after match creation.

Impact: A failed event write leaves a saved match without its intended events. The wizard stays open, and retrying creates another match. Repeated taps can also create duplicates while the first request is pending.

Improvement: Add a shared in-flight guard and visible pending/error state. Commit match and initial events together, and use a stable creation request ID for retries after ambiguous responses. Make token setup recoverable after successful creation. Risk: preserving existing live/manual creation and authorization semantics.

**9. Distinguish failed reads from empty data**

Evidence: [apps/app/src/lib/server-data.ts:32](https://github.com/marciobarrios/padelaso/blob/095b356ab5106168599e348bd7984bfddaa1a7cb/apps/app/src/lib/server-data.ts#L32) discards query errors and maps missing data to empty arrays. [apps/app/src/lib/supabase-hooks.ts:106](https://github.com/marciobarrios/padelaso/blob/095b356ab5106168599e348bd7984bfddaa1a7cb/apps/app/src/lib/supabase-hooks.ts#L106) and line 158 do the same. [apps/app/src/lib/server-auth.ts:36](https://github.com/marciobarrios/padelaso/blob/095b356ab5106168599e348bd7984bfddaa1a7cb/apps/app/src/lib/server-auth.ts#L36) turns a failed groups query into no groups, and [apps/app/src/lib/server-data.ts:81](https://github.com/marciobarrios/padelaso/blob/095b356ab5106168599e348bd7984bfddaa1a7cb/apps/app/src/lib/server-data.ts#L81) redirects that state to onboarding.

Impact: Database or network errors can appear as an empty group, missing matches, or incomplete statistics. Since fetchers resolve successfully, SWR receives no error to expose or retry as a failed request.

Improvement: Check query errors, propagate typed failures, and expose retryable UI states while retaining prior good data. Treat successful empty results separately from failed requests. Verify partial failures across matches, players, events, votes, and group lookup. Risk is mainly changing error presentation.

**10. Seed auth and group providers with server state**

Evidence: [apps/app/src/components/auth/auth-provider.tsx:22](https://github.com/marciobarrios/padelaso/blob/095b356ab5106168599e348bd7984bfddaa1a7cb/apps/app/src/components/auth/auth-provider.tsx#L22) starts with no user and supplies no initial group state at line 75. [apps/app/src/components/group/group-provider.tsx:22](https://github.com/marciobarrios/padelaso/blob/095b356ab5106168599e348bd7984bfddaa1a7cb/apps/app/src/components/group/group-provider.tsx#L22) already accepts initial groups and active ID. [apps/app/src/components/layout/mobile-shell.tsx:25](https://github.com/marciobarrios/padelaso/blob/095b356ab5106168599e348bd7984bfddaa1a7cb/apps/app/src/components/layout/mobile-shell.tsx#L25) hides children until browser auth/groups finish. [apps/app/src/lib/server-auth.ts:43](https://github.com/marciobarrios/padelaso/blob/095b356ab5106168599e348bd7984bfddaa1a7cb/apps/app/src/lib/server-auth.ts#L43) already has these values.

Impact: A fresh authenticated page pays for server auth and group queries, then still displays a shell skeleton while browser initialization and another groups request run.

Improvement: Seed providers inside an authenticated server boundary. Retain client auth events and group changes, and keep public/login routes lightweight. Verify sign-out, switching groups, cookie selection, and refresh. Risk: mismatched server/client identity or stale group state.

**11. Bound history reads and use compact event aggregates**

Evidence: [apps/app/src/lib/supabase-hooks.ts:158](https://github.com/marciobarrios/padelaso/blob/095b356ab5106168599e348bd7984bfddaa1a7cb/apps/app/src/lib/supabase-hooks.ts#L158) and lines 223/240 fetch unpaginated match/event/vote history. [apps/app/src/app/_components/home-page-content.tsx:47](https://github.com/marciobarrios/padelaso/blob/095b356ab5106168599e348bd7984bfddaa1a7cb/apps/app/src/app/_components/home-page-content.tsx#L47) displays only ten matches. [apps/app/src/app/_components/matches-page-content.tsx:40](https://github.com/marciobarrios/padelaso/blob/095b356ab5106168599e348bd7984bfddaa1a7cb/apps/app/src/app/_components/matches-page-content.tsx#L40) renders all returned matches. [apps/app/src/app/matches/[matchId]/scorekeeper/content.tsx:625](https://github.com/marciobarrios/padelaso/blob/095b356ab5106168599e348bd7984bfddaa1a7cb/apps/app/src/app/matches/%5BmatchId%5D/scorekeeper/content.tsx#L625) loads group event history just to count types, then revalidates it after each event at line 663.

Impact: Data transfer and match-list DOM size grow with group history. Recording a quick event can reload all group events just to reorder buttons. API row limits could also make all-time statistics incomplete, but the deployed row cap was not verified.

Improvement: Use recent matches plus a total count on home, stable pagination on history, and event-type aggregates for scorekeeping. Keep stats completeness explicit through aggregation or complete paginated retrieval. M covers lists/counts; broader statistics aggregation is L. Risk: inconsistent totals, ordering, or incomplete historical calculations.

**12. Let the fourth participant cast a first vote**

Evidence: [apps/app/src/components/match/match-voting.tsx:62](https://github.com/marciobarrios/padelaso/blob/095b356ab5106168599e348bd7984bfddaa1a7cb/apps/app/src/components/match/match-voting.tsx#L62) declares enough votes at three; line 132 hides voting controls once that threshold is met. Line 214 only offers Change vote to someone who already voted.

Impact: Once three people have voted, the eligible fourth participant sees results but has no way to submit their first vote. The winner display and voting eligibility are incorrectly coupled.

Improvement: Allow eligible participants without an existing vote to vote even when results are visible. Keep the existing three-vote winner threshold. Verify first vote after three others, changing a vote, and retracting it.

**13. Make populated-group deletion match its confirmation text**

Evidence: [supabase/migrations/20250401000000_groups.sql:115](https://github.com/marciobarrios/padelaso/blob/095b356ab5106168599e348bd7984bfddaa1a7cb/supabase/migrations/20250401000000_groups.sql#L115) adds player and match references to groups without delete cascades. [apps/app/src/lib/supabase-mutations.ts:62](https://github.com/marciobarrios/padelaso/blob/095b356ab5106168599e348bd7984bfddaa1a7cb/apps/app/src/lib/supabase-mutations.ts#L62) only deletes the group. [apps/app/src/app/groups/[groupId]/content.tsx:302](https://github.com/marciobarrios/padelaso/blob/095b356ab5106168599e348bd7984bfddaa1a7cb/apps/app/src/app/groups/%5BgroupId%5D/content.tsx#L302) promises removal of all players, matches, and events.

Impact: A group containing players or matches cannot be deleted under the checked-in schema: those foreign keys block the parent deletion.

Improvement: Implement the agreed deletion behavior through scoped cascades or an admin-authorized transaction. Cover populated and empty groups, another group's preservation, non-admin rejection, and score-token pointers. Risk: enabling destructive behavior that is currently blocked.

**14. Apply the selected period to MVP statistics**

Evidence: [apps/app/src/app/_components/stats-page-content.tsx:66](https://github.com/marciobarrios/padelaso/blob/095b356ab5106168599e348bd7984bfddaa1a7cb/apps/app/src/app/_components/stats-page-content.tsx#L66) filters matches and events by the selected period, but line 104 passes all votes to getMvpRankings. [apps/app/src/app/stats/_components/general-tab.tsx:257](https://github.com/marciobarrios/padelaso/blob/095b356ab5106168599e348bd7984bfddaa1a7cb/apps/app/src/app/stats/_components/general-tab.tsx#L257) displays that unqualified MVP ranking under the same page filter.

Impact: Selecting 30 or 90 days changes the surrounding statistics while MVP totals still include votes from outside that period.

Improvement: Filter votes by the selected match IDs before computing the period's MVP ranking, or explicitly label the section as all-time if that is the intended product rule. Verify a historical MVP vote outside the selected period.

**Recommended ordering**

Start focused behavioral coverage (4) alongside the dependency patch (2) and membership policy fix (1). Attach regression tests to urgent fixes rather than waiting for a complete test suite. Next address player deletion (3), token membership (5), and match creation (8). Failed-read handling (9) should precede the provider and freshness changes (7 and 10). Route-specific loading (6) is an independent performance win; use it as the starting point for pagination/aggregation (11). Voting (12) and period filtering (14) are small independent corrections. Group deletion (13) needs explicit integration coverage of its destructive scope.

**Verification performed and limits**

- Passed five direct Node assertions against the existing `packages/domain/src/matches.ts`: last-set updates, immutability, empty-scoreboard initialization, zero-floor decrement, and tied-set handling. This was an ad hoc check, not a committed regression suite.
- `node apps/app/shortcuts/validate-template.mjs` passed six mocked event flows and template structure/privacy checks.
- `plutil -lint apps/app/shortcuts/Padelaso.plist` passed.
- Working tree was clean before the report. No package installation, application build, live database mutation, deployment, or code edit was performed.
- No `node_modules` is present in this checkout. The declared lint/typecheck/build commands could not be run. The version-specific Next.js documentation requested by AGENTS.md is also absent with the dependencies; relevant official web documentation was used for review, and no framework code was written.
- The pnpm dependency-audit attempt timed out without an advisory result. The specific Next.js finding was independently verified against its official advisory; this is not a complete dependency vulnerability audit.
- Normal project gates after dependencies are available: `pnpm lint`, `pnpm typecheck`, `pnpm build`, or `pnpm check`. The product build needs its documented Supabase environment configuration. Those gates currently contain no domain/app behavioral tests.
- Not audited live: deployed RLS/grants/schema drift, query plans and database indexes under real load, production bundles and Core Web Vitals, browser/device behavior, full accessibility, CI settings outside the repository, and production error telemetry. No millisecond or percentage speedup is claimed.

**Additional investigation, separate from confirmed findings**

Server token refresh deserves an expiry-flow check: [apps/app/src/lib/supabase-server.ts:15](https://github.com/marciobarrios/padelaso/blob/095b356ab5106168599e348bd7984bfddaa1a7cb/apps/app/src/lib/supabase-server.ts#L15) catches cookie-write failures during Server Component refresh, and there is no checked-in proxy/middleware providing a response cookie refresh boundary. The OAuth callback handles sign-in, but does not run on ordinary authenticated requests. Current [Supabase SSR guidance](https://supabase.com/docs/guides/auth/server-side/creating-a-client?queryGroups=framework&framework=nextjs) calls for a writable refresh boundary. Confidence is medium about the user-visible impact because browser refresh can affect recovery. Reproduce a cold visit with an expired access token before selecting a fix; estimated effort M, fix risk medium.

**Product options, not defects**

- Archive players while preserving history. [packages/domain/src/types.ts:23](https://github.com/marciobarrios/padelaso/blob/095b356ab5106168599e348bd7984bfddaa1a7cb/packages/domain/src/types.ts#L23) has no archive state, and the current deletion path removes historical participation. An archive action could hide inactive players from team selection while keeping old results meaningful. This adds archive/restore behavior and filter rules; estimated M–L.
- Define live versus completed matches explicitly. [packages/domain/src/types.ts:38](https://github.com/marciobarrios/padelaso/blob/095b356ab5106168599e348bd7984bfddaa1a7cb/packages/domain/src/types.ts#L38) has no match status, while [apps/app/src/components/match/match-wizard.tsx:130](https://github.com/marciobarrios/padelaso/blob/095b356ab5106168599e348bd7984bfddaa1a7cb/apps/app/src/components/match/match-wizard.tsx#L130) creates live matches and [packages/domain/src/stats.ts:64](https://github.com/marciobarrios/padelaso/blob/095b356ab5106168599e348bd7984bfddaa1a7cb/packages/domain/src/stats.ts#L64) processes every supplied match. A lifecycle could clarify when standings should count a match, but it requires a completion action and a decision about existing history; estimated M–L. Treat this as a product decision, not an assumed bug in the current rules.

**Considered and not recommended as findings**

- Replacing the fixed ten-match ranking threshold: it is explicit in the inspected domain code and reflects a product rule, not an efficiency defect.
- Removing stable Shortcut tokens or restricting match management back to the creator: both are deliberate migration choices. The finding is missing current-membership authorization, not token stability or collaborative editing itself.
- Adding generic memoization everywhere: React Compiler is already enabled, and larger wins exist in fetching and persistence. Profile before introducing more manual memoization.
- Claiming an index is missing or that production truncates at a specific row count: no live query plans or API row-cap settings were available.
- Claiming marketing's missing direct compiler-plugin declaration proves a broken build: the lockfile already records the peer in the resolved Next.js package. Isolated dependency resolution/build verification is needed before calling this a failure.

All findings are unimplemented. Select items by number for self-contained implementation plans.
