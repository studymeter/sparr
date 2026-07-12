# SECURITY.md

Security requirements. Not preferences — requirements. Enforced mechanically by hooks and CI. Follow them before writing any code.

## Secrets (most important)

This app's largest attack surface is the OpenAI API key. This is the one place you must never get wrong.

- The OpenAI **standard API key is server-side only**. Never expose it to the client.
- The client uses **only the ephemeral key that the server issues**. Never return the standard key to the client in an API response.
- **Do not put keys, tokens, or secrets under `NEXT_PUBLIC_`** (they get baked into the client bundle at build time and leak).
- **Do not hardcode** secrets in code. Put them in `.env.local` (gitignored), and write **only the key names** in `.env.example`.
- Do not edit or commit secret files such as `.env` / `.env.local` (`.env.example` / `.env.sample` are fine).

## Server boundary

- Put secret-handling logic — such as ephemeral key issuance — under **`app/api/**` (the server)\*\*.
- Do not touch the standard key or `process.env` secrets from a `"use client"` file.

## Dependencies

- Add dependencies via **npm only**. Do not introduce non-npm tools, vendored binaries, or `curl | sh`-style installers.
- Allowed licenses are **MIT / BSD / Apache-2.0 / ISC** only. Do not add GPL/AGPL/SSPL, etc. (consult a human in the PR if needed).
- **Do not add dependencies with known vulnerabilities (high or above)** (CI's `npm audit` will fail).
- Always state the reason for a new dependency in the PR description. Do not add a dependency for something the standard library or Next.js built-ins already cover.

## Handling input (prompt-injection defense)

- **Do not trust** user input or model output that flows to an AI character. Design so the system does not comply with input that tries to extract the system prompt or server secrets.
- Do not feed external text (including model responses) directly into `eval`, shell execution, `dangerouslySetInnerHTML`, etc.

## Code provenance

- Do not paste large blocks of code of unknown origin. Do not remove existing copyright/license notices.
