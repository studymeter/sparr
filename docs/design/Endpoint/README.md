# Endpoint Design

This directory contains HTTP API contracts only.

## Source of truth

- Architecture intent is defined in `docs/architecture/`.
- Endpoint HTTP contracts are defined in:
  - `docs/design/Endpoint/openapi.yaml` (player)
  - `docs/design/Endpoint/openapi-admin.yaml` (admin)
- Provider contracts are defined in `lib/providers/` and are not represented in OpenAPI.

## Policy

- Keep this layer aligned with `docs/architecture/`.
- If implementation differs from higher-level docs, fix implementation/design docs to match architecture.
- Do not move provider interface details into OpenAPI.

## Commands

```bash
npm run api:lint
npm run api:docs
```
