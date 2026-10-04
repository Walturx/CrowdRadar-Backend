# CrowdRadar Backend

REST API for CrowdRadar (Express 5, Sequelize 6, PostgreSQL 16, TypeScript).
This README is a skeleton; the full version (layout, layering rule, docker run) lands with BE-09.

## Prerequisites

- Node 22 or newer
- PostgreSQL 16 (or `docker compose up -d postgres`)

## Quick start

```bash
cp .env.example .env   # adjust values, never commit .env
npm ci
docker compose up -d postgres
npm run dev
```

## Scripts

| Script | Purpose |
|---|---|
| `npm run dev` | API with reload (`tsx watch`) |
| `npm run build` | Compile to `dist/` (`tsc -p tsconfig.build.json`) |
| `npm start` | Run the compiled server |
| `npm run lint` | `tsc --noEmit` and ESLint |
| `npm test` | Vitest (no database required) |
| `npm run test:cov` | Tests with coverage report |

## Opt-in database tests

Tests that need a real PostgreSQL are skipped unless `DATABASE_URL_TEST` is set, for example
`postgres://crowdradar:cambiar-password-local@localhost:5432/crowdradar_test`. That database is
throwaway: the tests may create and drop tables in it.

## Baseline

The tag `sprint1-js` marks the original JavaScript Sprint 1 code.
