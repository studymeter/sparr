#!/usr/bin/env sh
# Local reproduction of the GitHub CI gate (.github/workflows/security.yml).
#
# Why: the CI "security" workflow is the only non-bypassable gate, but locally
# only typecheck/lint (pre-commit) and the license check (pre-push) ran. So
# `npm audit`, `build`, and the client-secret greps failed *after* pushing.
# This runs the SAME checks CI runs, so a red PR is caught before handoff.
#
# Keep in sync with security.yml: one section here per CI job. If a CI job
# changes, mirror it here (and vice versa). This does NOT replace CI — it is a
# fast local mirror; CI on GitHub remains the final, authoritative gate.
#
# Runs every check (does not stop at the first failure) and prints a summary,
# exiting non-zero if any failed.

set -u

fail=0
note() { printf '\n>>> [preflight] %s\n' "$1"; }
mark_fail() { printf '    FAIL: %s\n' "$1"; fail=1; }

# --- CI job: quality (lint / typecheck / build) ---------------------------
note "type check (CI: quality)"
npm run typecheck || mark_fail "typecheck"

note "lint (CI: quality)"
npm run lint || mark_fail "lint"

# The build reads provider env vars lazily at runtime, so it succeeds without a
# real key here (CI passes one only defensively). A missing .env.local is fine.
note "build (CI: quality)"
npm run build || mark_fail "build"

# --- CI job: licenses (allowlisted licenses only) -------------------------
note "license allowlist (CI: licenses)"
npm run license:check || mark_fail "licenses"

# --- CI job: dependencies (npm audit high+) -------------------------------
note "dependency audit, high+ (CI: dependencies)"
npm audit --audit-level=high || mark_fail "audit (high+ vulnerability)"

# --- CI job: client-secret-leak -------------------------------------------
# The CI job runs these greps on the checkout WITHOUT node_modules (it does no
# `npm ci`), so we exclude node_modules/.next/.git to match its result exactly.
note "client secret leak (CI: client-secret-leak)"

# 1) No client-exposed env var that looks like a credential.
if grep -rInE 'NEXT_PUBLIC_[A-Za-z0-9_]*(KEY|SECRET|TOKEN|PASSWORD)' \
     --include='*.ts' --include='*.tsx' --include='*.js' --include='*.jsx' --include='*.env*' \
     --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=.git . ; then
  mark_fail "client-exposed credential-like variable"
fi

# 2) No server secret (process env) referenced from a "use client" file.
client_leaks=$(
  grep -rIlE '["'\'']use client["'\'']' \
    --include='*.ts' --include='*.tsx' --include='*.js' --include='*.jsx' \
    --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=.git . 2>/dev/null \
  | while IFS= read -r f; do
      grep -lE 'process\.env\.(OPENAI_API_KEY|[A-Z0-9_]*SECRET[A-Z0-9_]*|[A-Z0-9_]*API_KEY)' "$f"
    done
)
if [ -n "$client_leaks" ]; then
  printf '    server secret referenced in client file(s):\n%s\n' "$client_leaks"
  mark_fail "server secret in client file"
fi

# 3) No hardcoded provider key.
if grep -rInE 'sk-[A-Za-z0-9_-]{20,}' \
     --include='*.ts' --include='*.tsx' --include='*.js' --include='*.jsx' --include='*.json' \
     --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=.git . ; then
  mark_fail "hardcoded provider key"
fi

# --- CI job: secret-scan (gitleaks) ---------------------------------------
# gitleaks needs a binary. Run it when present; otherwise say so plainly rather
# than pretend the check passed — CI still enforces it server-side.
note "secret scan / gitleaks (CI: secret-scan)"
if command -v gitleaks >/dev/null 2>&1; then
  gitleaks detect --source . --redact || mark_fail "gitleaks secret scan"
else
  printf '    SKIP: gitleaks not installed locally; this check runs in CI only.\n'
  printf '          Install it to fully guarantee green before pushing.\n'
fi

# --- summary --------------------------------------------------------------
if [ "$fail" -ne 0 ]; then
  printf '\n>>> [preflight] FAILED — fix the items above before pushing.\n'
  exit 1
fi
printf '\n>>> [preflight] All CI-equivalent checks passed. Safe to push.\n'
