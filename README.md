# Sparr

Sparr is a self-hosted system for roleplaying real work situations together with AI. You define a **scenario**, and Sparr turns it into a voice-driven roleplay: the AI plays the people you talk to, you work the situation in real time, and you get scored feedback at the end. Because a scenario is just configuration, the same engine can drive very different roleplays — sales calls, support escalations, project crises, interviews, negotiations, and more.

(The name is from _sparring_ — low-stakes practice bouts you repeat to get better.)

## Quick start

```bash
cp .env.example .env.local   # set OPENAI_API_KEY
npm install                  # installs deps (and enables husky git hooks)
npm run dev                  # http://localhost:3000
```

Voice calls need microphone permission, so run on `localhost` or over HTTPS. The standard `OPENAI_API_KEY` stays server-side; the browser only ever receives a server-issued ephemeral key.

Contributors, once:

```bash
chmod +x .claude/hooks/*.sh                # Claude Code: pre-tool guard hooks
bash scripts/bootstrap-cursor-hooks.sh     # Cursor: rules + local hooks
```

## Docker

Requires [Docker Engine](https://docs.docker.com/engine/install/) and Compose V2.

```bash
cp .env.example .env          # set OPENAI_API_KEY (and auth settings; see below)
docker compose up --build     # http://localhost:3000
```

SQLite data is stored in the named volume `sparr-data` (survives container restarts).

After changing `.env` (auth, API keys, etc.), restart the stack — no image rebuild required:

```bash
docker compose down && docker compose up
```

Production containers run with `NODE_ENV=production`. Either set `AUTH_PROVIDER=authjs` with `AUTH_SECRET`, or set `AUTH_ALLOW_ANONYMOUS=true` to run the anonymous demo.

For PostgreSQL instead of SQLite, add to `.env`:

```bash
STORE_PROVIDER=postgres
POSTGRES_DATABASE_URL=postgres://sparr:sparr@postgres:5432/sparr
```

For Supabase (hosted PostgreSQL), use:

```bash
STORE_PROVIDER=supabase
SUPABASE_DATABASE_URL=<Supabase Database connection string>
```

Then start with the Postgres profile:

```bash
docker compose --profile postgres up --build
```

Override the default Postgres credentials in `docker-compose.yml` before deploying.

Voice calls still need `localhost` or HTTPS in front of the container (for example nginx or Caddy).

## Environment variables

Server-side only — never exposed to the client.

### Required

| Variable               | Description                                                                                                       |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `OPENAI_API_KEY`       | OpenAI API key.                                                                                                   |
| `AUTH_PROVIDER`        | Authentication mode: `none` (anonymous) or `authjs` (Auth.js).                                                    |
| `AUTH_ALLOW_ANONYMOUS` | Set to `true` to allow anonymous access (`AUTH_PROVIDER=none`) in production. Required when running without auth. |

When `AUTH_PROVIDER=authjs`, also set `AUTH_SECRET` (and `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` for Google sign-in).

### Optional

| Variable                | Description                                                   | Default          |
| ----------------------- | ------------------------------------------------------------- | ---------------- |
| `OPENAI_TEXT_MODEL`     | Setup / document / scoring generation                         | `gpt-5.2`        |
| `OPENAI_REALTIME_MODEL` | Voice (calls)                                                 | `gpt-realtime-2` |
| `OPENAI_VAD_*`          | Voice-activity-detection tuning                               | optional         |
| `AI_PROVIDER`           | `openai` / `fake`                                             | `openai`         |
| `VOICE_PROVIDER`        | Voice-issuing adapter                                         | `openai`         |
| `STORE_PROVIDER`        | `sqlite` / `memory` / `postgres` / `supabase`                 | `sqlite`         |
| `SQLITE_PATH`           | SQLite DB file path                                           | `./data/demo.db` |
| `POSTGRES_DATABASE_URL` | Postgres connection (when `STORE_PROVIDER=postgres`)          | optional         |
| `SUPABASE_DATABASE_URL` | Supabase Postgres connection (when `STORE_PROVIDER=supabase`) | optional         |

Keep `OPENAI_API_KEY` server-side. Never put keys, tokens, or secrets under `NEXT_PUBLIC_` (they get baked into the client bundle).

## How a roleplay works

A session runs as a loop you can repeat as often as you like:

```mermaid
flowchart LR
  A[Start] --> B[Prepare] --> C[Dialogue] --> D[Add input] --> E[Evaluation] --> F[Relearn] --> A
```

1. **Start** — Pick a scenario. Sparr generates the AI personas and a set of fictional project documents for this play.
2. **Prepare** — Read the documents and build your own hypothesis and proposal.
3. **Dialogue** — Talk by voice with the AI playing the customer / internal-staff roles.
4. **Add input** — Ask the AI for more material; the requested document is generated and added to the case folder.
5. **Evaluation** — When you finish, review a rubric-based score and feedback.
6. **Relearn** — Use the feedback to revise your approach and try again.

## What a scenario is made of

A scenario is authoring, not code. It lives in the database (through the `Store` provider) as one `SCENARIO` plus its cast of `PERSONA` rows.

**SCENARIO** — four prompts:

| Field              | What it defines                                |
| ------------------ | ---------------------------------------------- |
| `base_prompt`      | The base scenario and its world                |
| `challenge_prompt` | The problem the player has to solve            |
| `documents_prompt` | How to generate the initial reference material |
| `rubric_prompt`    | How to score the session                       |

**PERSONA** — one row per character in the cast:

| Field              | What it defines                                   |
| ------------------ | ------------------------------------------------- |
| `character_prompt` | Personality and role                              |
| `voice_code`       | The generative-AI voice                           |
| `doc_tool_enabled` | Whether this character may produce work documents |

### Base scenario → a fresh instance every play

The `SCENARIO` and `PERSONA` rows are the **base**. At the start of each play, Sparr generates a concrete **scenario instance** from them: the specific situation and names, a rolled hidden "truth" (the root cause), and each character's hidden facts and current mood. That instance lives only in the browser for the session and is never persisted — so the same base scenario plays out differently every time and replay stays meaningful. Only the result (score and feedback) is stored.

## Customizing with adapters

Sparr reaches every external capability — AI, voice, persistence, auth — through a **provider** (an interface) with a concrete **adapter** behind it. Swap the adapter and you connect to a different external service or database without touching the engine. The built-ins cover the common cases:

- **AI** — ChatGPT Adapter (OpenAI Chat Completions)
- **Voice** — ChatGPT Realtime Adapter (OpenAI Realtime API)
- **Store** — SQLite Adapter (default) or PostgresDB Adapter
- **Auth** — Auth.js Auth Adapter (OAuth + email/password)

Select a built-in via the `*_PROVIDER` variables above, or write your own adapter to integrate another service. See `docs/architecture/` for the provider/adapter design.

## AI development flow

This repo is built so that security checks apply uniformly no matter who — or which AI agent — writes the code:

- **Guidance:** `CLAUDE.md` (canon for all AI tools) + `.cursor/rules/*.mdc` (Cursor summary).
- **Local block (Claude Code):** `.claude/hooks/*` block secret leaks and dangerous commands before a tool runs.
- **Local block (Cursor):** `.cursor/hooks/*` mirror the same guards.
- **Git hooks:** `.husky/*` run type / lint / security checks before commit and push.
- **AI review:** the security-guidance plugin (Claude Code) detects and fixes vulnerabilities — advisory, does not block.
- **Final gate:** `.github/workflows/security.yml` (CI) + branch protection — a red PR cannot merge. This is the only absolute gate.

Rules of the road: don't bypass checks (`--no-verify`, etc.) or merge a red PR; never commit secrets (use `.env.local`); new dependencies must use an allowed license (MIT / BSD / Apache-2.0 / ISC) and carry no known high-severity vulnerabilities. See `SECURITY-SETUP.md` for setup, branch protection, and limits.

## Repository layout (root)

```
app/                    Next.js App Router — UI pages and API routes
components/             React components (screens)
lib/                    engine, providers, adapters, prompts, composition wiring
prompts/                hand-written, fixed prompts
docs/                   architecture and design docs
scripts/                tooling (Cursor-hook bootstrap, doc tooling, …)
public/                 static assets
.claude/                Claude Code hooks and security settings
.cursor/                Cursor rules and local hooks
.github/                CI workflows (security gate)
.husky/                 git hooks (pre-commit / pre-push checks)
auth.ts                 Auth.js (NextAuth) configuration
CLAUDE.md               canon for AI agents — workflow and security
SECURITY.md             security requirements
SECURITY-SETUP.md       security operations: setup, branch protection, limits
CODING-GUIDELINES.md    coding guidelines (canon)
LICENSE                 MIT license
README.md               this file
package.json            scripts and dependencies
package-lock.json       dependency lockfile
.env.example            environment-variable template (names only)
Dockerfile              production container image
docker-compose.yml      local / self-hosted stack (SQLite or Postgres profile)
.dockerignore           files excluded from the Docker build context
tsconfig.json           TypeScript config
next.config.js          Next.js config
eslint.config.mjs       ESLint (flat config)
.eslintrc.json          ESLint (legacy config)
.prettierrc             Prettier config
.prettierignore         Prettier ignore list
redocly.yaml            OpenAPI / Redocly config for the Runtime API docs
.protected.local.example  template for the protected-paths guard
.gitignore              git ignore list
```

> `node_modules/`, `.env.local`, and the SQLite database under `data/` are generated locally and gitignored.

## License

MIT — see [`LICENSE`](./LICENSE). © 2026 Studymeter Inc.
