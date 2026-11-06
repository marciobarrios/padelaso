<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Linear issues and pull requests

- For every PR that completes a Linear issue, include a closing keyword and the issue identifier in the PR description, on its own line: `Fixes MAR-43` (replace with the actual issue ID). Use one line per completed issue, and preserve these lines when editing the description.
- Use `Refs MAR-43` for partial work that should leave the issue open. Closing keywords belong only on PRs that complete the issue.
- Before handing off a PR, verify that its description contains the intended closing lines and that Linear shows the PR linked with a closing relationship. A bare issue ID, URL, or PR comment is not a substitute for the closing line.
- Linear's team workflow must map **On PR or commit merge** to **Done** for automatic completion. If a merged PR left an issue open, verify the merge, repair the link, and confirm the final issue status; do not claim automatic completion without checking it.

Reference: [Linear GitHub integration](https://linear.app/docs/github).
