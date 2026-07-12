# CLAUDE.md

Project guidance for Claude Code. This file is the canonical source for **workflow and security requirements**.

@README.md
@SECURITY.md
@CODING-GUIDELINES.md

## System overview

A generic AI roleplay training engine (OSS, self-hosted). The player talks by voice with several AI-played characters and gets an evaluation at the end. The big picture lives in `docs/architecture/` (`overview` / `components` / `data-model`); per-layer detail in `docs/design/`.

## Tech stack

- Next.js (App Router) + TypeScript. Package manager: **npm** (Node 20+).
- Structure: **Provider/Adapter** (swap boundaries) — AI / Voice / Auth / Store. Wiring is centralized in `lib/composition.ts` (client voice in `lib/composition.client.ts`).
- Built-in adapters: AI/Voice = OpenAI (+ Azure), Store = SQLite (OSS default) / memory / PostgreSQL, Auth = Auth.js.
- Persistence goes through `Store` (OSS default SQLite); auth through `AuthProvider` (optional).

## Constraints

- **Write everything in English** — documentation, code, comments, and commit messages. (A scenario's in-world content may be in its own target language.)

### Source-of-truth precedence

When descriptions conflict, the order is **CLAUDE.md (with `@SECURITY.md` and `@CODING-GUIDELINES.md`) > `docs/architecture/` > `docs/design/` > implementation code.** The higher level wins. If a lower level (especially code) conflicts with a higher one, fix the lower level to match. When changing a design, update the higher-level doc first, then propagate down.

### Enforcement (defense in depth)

This file is guidance and can be overridden by a prompt, so the must-keep items are also **enforced mechanically**:

- **Soft (advisory):** the official `security-guidance` plugin (a separate Claude reviews and fixes vulnerabilities while coding; **does not block**) plus this file.
- **Hard (local block):** Claude Code hooks in `.claude/settings.json` (block before a tool runs / verify before a turn ends; Claude itself cannot bypass them).
- **Hard (server block):** CI required checks in `.github/workflows/security.yml` (a PR cannot merge until they pass; no one, admins included, can bypass — the final gate).

**Do not disable, bypass, or skip the hooks, CI, or the security plugin.** Removing hooks, editing `.claude/settings.json`, `git commit --no-verify`, adding `continue-on-error` to CI, removing a required check, or disabling the plugin are all forbidden. If you need to touch any of these, stop and ask a human.

## Ownership (self-managed guard)

- Do not change areas you don't own or someone else's primary area. In particular, **do not concretize the abstract design (`docs/architecture/`)** — keep coarse layer locations only; no individual file names, implementation status, or migration stages.
- You may lock paths against AI edits in `.protected.local` (gitignored, optional): one path-glob per line listing files/directories the AI must not touch. While it exists, the Claude Code / Cursor hooks **block Edit/Write to any listed path — and to `.protected.local` itself**; to change what is protected, a human edits the file by hand (template: `.protected.local.example`; forms: `dir/`, `dir/**`, `dir/*`, exact path).
- This is prevention, not a guarantee (a human can disable it). The hard guarantee is server-side branch protection.

## Workflow (Claude Code)

- Common commands:
  - `npm run dev` — dev server
  - `npm run typecheck` — `tsc --noEmit` (type errors)
  - `npm run lint` — ESLint
  - `npm run build` — production build (fails on type errors)
  - `npm run license:check` — dependency license check
- **Definition of "done":** after a change, `typecheck` and `build` pass for the affected scope. Anything that doesn't is not done (a Stop hook verifies types before the turn ends). For UI/dialogue changes, also **launch the app (reference scenario) and try it yourself** before reporting.
- **Commit message format:** `<type>: <subject>` (Conventional Commits).
  - `feat` — new user-facing feature
  - `fix` — bug fix
  - `docs` — documentation only
  - `refactor` — restructuring without behavior change
  - `chore` — maintenance (deps, config, tooling, CI)
  - `test` — tests only
  - `style` — formatting, no logic change
- **Do not commit or push without an explicit instruction.** The `guard-bash.sh` hook blocks mechanically based on the presence of a `.push-authorized` token.
  - commit/push cycle: ① create `.push-authorized` → ② run the commit+push+CI loop → ③ delete `.push-authorized` after the cycle.
  - After `git push`, drive CI to green: watch all jobs, read logs on failure, fix → commit → push, and repeat. **Retry at most 3 times.** If still failing after 3, stop and hand the error log to a human.
  - **This flow is valid only once per explicit "commit"/"push" request.** Never commit or push on your own initiative.
- **Make it work > make it clean.** No premature abstraction or generalization.
- Keep changes scoped to the task. No unrelated refactors.
- Don't fill spec gaps with a guess. If unsure, stop and ask.

## Config files

Settings and hooks. **Do not touch any of these** — the only exception is `.protected.local`, which you create by copying `.protected.local.example`.

- `.claude/settings.json` / `.claude/hooks/*` — Claude Code security/verify hooks
- `.claude/claude-security-guidance.md` / `.claude/security-patterns.json` — extra rules for the security-guidance plugin
- `.cursor/rules/*.mdc` — Cursor project rules (canonical content is `CLAUDE.md`)
- `.cursor/hooks.json` / `.cursor/hooks/*` — Cursor local guards
- `.github/workflows/security.yml` — CI gate
- `.protected.local.example` — template; copy to `.protected.local` (gitignored) to lock paths against AI edits
