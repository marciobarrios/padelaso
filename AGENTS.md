<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Toolchain

- Node and pnpm versions are pinned in [mise.toml](mise.toml), and CI reads them from there. Run commands through mise (`mise install`, then `mise exec -- pnpm …`, or an activated shell). A new worktree may first need `mise trust`.
- When you bump either version, change `mise.toml` and the root `packageManager` together, and update the toolchain lines in README.md and apps/mobile/README.md.
- Machine-specific tool pins belong in the git-ignored `mise.local.toml`, not `mise.toml`.

## Linear issues and pull requests

- For every PR that completes a Linear issue, include a closing keyword and the issue identifier in the PR description, on its own line: `Fixes MAR-43` (replace with the actual issue ID). Use one line per completed issue, and preserve these lines when editing the description.
- Use `Refs MAR-43` for partial work that should leave the issue open. Closing keywords belong only on PRs that complete the issue.
- Before handing off a PR, verify that its description contains the intended closing lines and that Linear shows the PR linked with a closing relationship. A bare issue ID, URL, or PR comment is not a substitute for the closing line.
- Linear's team workflow must map **On PR or commit merge** to **Done** for automatic completion. If a merged PR left an issue open, verify the merge, repair the link, and confirm the final issue status; do not claim automatic completion without checking it.

Reference: [Linear GitHub integration](https://linear.app/docs/github).

## Simulators and emulators

- When you finish testing on an iOS Simulator or Android Emulator, release it before your final reply: close every device you opened (in T3 Code, `device_close`). An open device keeps its claim, and other threads get `DEVICE_IN_USE` until it is released.
- Release only devices you opened. Never close another thread's session unless the user asks.
- Also stop any dev server you started for device testing.

## Saved browser session for Padelaso

- Before declaring an authenticated browser check blocked, read the **Production monitoring** section of [AUTOPILOT.md](AUTOPILOT.md), even outside an autopilot run. It documents the saved `agent-browser` state at `~/.autopilot/auth/padelaso.json` and how to load, re-save and refresh it.
- The state is local to this machine; check that it exists. Never print, commit, upload or copy its cookies or tokens into the repository.
- Its authorization is limited to read-only production checks in the **Test** group. It does not authorize Preview sign-in, settings changes, revoking connections, or other writes. Follow the documented page scope and group checks.
- Use the saved state sequentially across agents, re-save after every check and retain mode `600`: Supabase rotates refresh tokens. If another agent is using it, wait rather than loading a second copy. If expired, report it and follow the documented owner refresh flow.
