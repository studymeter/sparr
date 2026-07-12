# SECURITY-SETUP.md

How security is enforced so it applies uniformly to every contributor —
no matter who writes the code or which AI coding tool they use.

## Layers (and what each actually guarantees)

| Layer                         | File / tool                                                                                           | Enforced by                                  | Can a contributor bypass it?                                        |
| ----------------------------- | ----------------------------------------------------------------------------------------------------- | -------------------------------------------- | ------------------------------------------------------------------- |
| 1. Intent / guidance          | `CLAUDE.md` + `.cursor/rules/*.mdc`                                                                   | The model reading it                         | Yes — a prompt can override it. Not a guarantee.                    |
| 2. In-session AI review       | `security-guidance` plugin + `.claude/claude-security-guidance.md` + `.claude/security-patterns.json` | A separate Claude review at edit/turn/commit | It advises & fixes but **does not block**; can be disabled locally. |
| 3a. Local block (Claude Code) | `.claude/settings.json` + `.claude/hooks/*`                                                           | Claude Code harness (outside the model)      | Claude can't. A human can edit settings or skip Claude Code.        |
| 3b. Local block (Cursor)      | `.cursor/hooks.json` + `.cursor/hooks/*`                                                              | Cursor harness (outside the model)           | Cursor can't. A human can edit settings or skip Cursor hooks.       |
| 4. Server-side gate           | `.github/workflows/security.yml` + branch protection                                                  | GitHub, on every PR                          | **No** — this is the real "cannot be kicked" gate.                  |

The guarantee comes from **layer 4**. Layers 1–3 make the right thing happen by
default and catch problems early — the plugin (layer 2) is especially valuable
because it catches _logic-level_ vulnerabilities (authz bypass, IDOR, SSRF, weak
crypto) that the regex hooks in layer 3 cannot. But only layer 4 makes it
impossible for insecure code to reach `main`.

**Canonical docs:** `CLAUDE.md` (workflow, security) and `docs/architecture/` (design).
`.cursor/rules/*.mdc` summarizes these for Cursor; do not drift from the canon.

> **Team-specific onboarding** (branch protection checklist, internal workflows):
> see `docs.local/TEAM.md` — gitignored, not published with the OSS repo.
> Maintainers: see `scripts/team/README.md` for how the team keeps local docs.

## What the CI gate checks

- **secret-scan** — gitleaks across full history; fails if a secret is committed.
- **dependencies** — `npm audit --audit-level=high`; fails on known high/critical CVEs.
- **licenses** — only MIT/BSD/Apache-2.0/ISC-family licenses allowed.
- **client-secret-leak** — static checks that no `NEXT_PUBLIC_*` secret var exists,
  no `"use client"` file reads server secrets, and no hardcoded `sk-...` keys.
- **quality** — lint, typecheck, build all pass.

## Branch protection (repository maintainers)

To make layer 4 non-bypassable, configure **branch protection** (or a ruleset) on
`main` in your GitHub repository:

1. **Require a pull request before merging** (no direct pushes to `main`).
2. **Require status checks to pass**, selecting:
   `secret-scan`, `dependencies`, `licenses`, `client-secret-leak`, `quality`.
3. **Require branches to be up to date before merging.**
4. **Require review from Code Owners** (optional but recommended; pair with `CODEOWNERS`).
5. **Do not allow bypassing** — so admins cannot merge failing PRs.
6. **Block force pushes** and **restrict deletions** on `main`.

Forks and personal clones can skip branch protection locally; **CI on PRs to the
upstream repo** is what matters for the shared codebase.

## Local setup — Claude Code (each contributor, once)

```bash
chmod +x .claude/hooks/*.sh
```

Hooks parse input with Node (required by Claude Code anyway). `.claude/settings.json`
is committed, so every clone gets the same hooks. Personal overrides go in
`.claude/settings.local.json` (gitignored) and must not weaken shared gates.

## Local setup — Cursor (each contributor, once)

Project rules live in `.cursor/rules/*.mdc`. They point to **`CLAUDE.md`**;
do not duplicate or drift from it.

Local hooks mirror Claude Code's guards (secrets, bash, read, format, typecheck):

```bash
bash scripts/bootstrap-cursor-hooks.sh
# or, if hooks already exist:
chmod +x .cursor/hooks/*.sh
```

`.cursor/hooks.json` is committed. Restart Cursor after the first bootstrap if
hooks were cached while scripts were missing.

**Verify hooks:** Cursor Settings → Hooks (Project Hooks listed). Hooks apply to
**Agent shell commands**, not your manual terminal. Ask the Agent to run
`git commit --no-verify` — it should be blocked.

Personal Cursor user rules must not contradict project rules (e.g. bypassing
security or adding unapproved dependencies).

## Official security-guidance plugin (Claude Code)

`.claude/settings.json` declares the plugin under `enabledPlugins`, so it is
**on by default for everyone who clones**. Each contributor should still run it
once locally so the install completes:

```text
/plugin install security-guidance@claude-plugins-official
/reload-plugins
```

If Claude Code says the marketplace is not found, add it first:

```text
/plugin marketplace add anthropics/claude-plugins-official
```

Prerequisites (otherwise the model-backed layers silently degrade):

- Claude Code CLI **2.1.144+**
- **Python 3.8+** on PATH (first run builds a venv under `~/.claude/security/` and
  installs the Claude Agent SDK via pip — needs network)
- Work inside a git repo (the turn/commit reviews diff against git state)

What it does: a free, no-model regex pass on every edit, plus model-backed reviews
at end-of-turn and on commit/push that catch logic flaws. It reads repo rules from
`.claude/claude-security-guidance.md` and `.claude/security-patterns.json`.

**Important limits:** the plugin **does not block** writes or commits — it advises
and fixes in-session, and can miss things. The model-backed reviews spend tokens
(Opus 4.7 by default; ~1 review per file-changing turn, commit reviews capped at
20/hour). Truly _mandatory_ (non-disableable) enrollment requires an admin to set
`enabledPlugins` in **managed settings**; the project `settings.json` default can be
turned off per-developer via `/plugin disable`. Either way, the plugin is not the
non-bypassable gate — that is still the CI in layer 4.

## Required npm scripts

The hooks and CI call these — they must exist in `package.json`:

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "lint": "next lint",
    "typecheck": "tsc --noEmit",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "license:check": "license-checker-rseidelsohn --production --onlyAllow \"MIT;ISC;Apache-2.0;BSD-2-Clause;BSD-3-Clause;BSD;0BSD;Unlicense;CC0-1.0\" --excludePrivatePackages"
  }
}
```

## Honest limits

- The `security-guidance` plugin is best-effort and **non-blocking** by design; it
  reduces what reaches review but does not guarantee it, and a contributor can
  disable it unless it is pushed via managed settings.
- Hooks are a strong _local_ gate but anyone controls their own machine; treat
  them as fast feedback, not the guarantee.
- The static `client-secret-leak` checks are heuristics (regex). They catch the
  common mistakes; they are not a substitute for code review on the server route
  that mints ephemeral keys.
- Secret scanning catches secrets _as they are committed_. Anything already
  leaked must be rotated, not just deleted from a file.
