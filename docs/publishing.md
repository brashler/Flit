# Publishing flit-physics

Publishing is CI-driven (`.github/workflows/publish.yml`); nobody needs a
working npm login on their laptop.

## One-time setup

1. On npmjs.com: create a **Granular Access Token** with read+write on the
   `flit-physics` package (a classic Automation token also works).
2. In the GitHub repo: **Settings → Secrets and variables → Actions**,
   add it as `NPM_TOKEN`.

## Cutting a release

1. Land everything on `main`: code, tests green, `CHANGELOG.md` entry,
   and `package.json` bumped to the new version (plus `package-lock.json`
   and `server.json` to match).
2. Tag it: `git tag vX.Y.Z && git push origin vX.Y.Z`.
3. The workflow checks tag == package.json version, runs `npm ci`,
   typecheck, and the full test suite, then publishes with
   `npm publish --access public --provenance`.

Or skip the tag and use **Actions → Publish to npm → Run workflow** — it
publishes whatever version is in `package.json` at HEAD (same gates).

Notes:

- `--provenance` attaches a GitHub-OIDC attestation to the release (see it
  on the npm page under "provenance"). If it ever errors, dropping that
  flag still leaves a normal token publish.
- The `prepublishOnly` script re-runs build+test inside the publish step —
  intentionally; the belt matches the suspenders.
- The **MCP Registry** listing (`server.json`) is a separate manual step
  (`mcp-publisher` or the registry UI) once the npm version is live.
- If a publish fails with 404/401, the `NPM_TOKEN` secret is missing,
  expired, or lacks write on the package.
