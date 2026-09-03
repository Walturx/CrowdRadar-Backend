/** CI hygiene (spec A12.2-3): lint + unit tests, then the database-backed suite against a Postgres service. */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const RAIZ = resolve(import.meta.dirname, '..', '..');
const ruta = resolve(RAIZ, '.github/workflows/ci.yml');
const ci = existsSync(ruta) ? readFileSync(ruta, 'utf8') : '';

describe('.github/workflows/ci.yml', () => {
  it('existe y corre en push y pull request', () => {
    expect(ci).not.toBe('');
    expect(ci).toMatch(/^on:\s*$/m);
    expect(ci).toMatch(/push:/);
    expect(ci).toMatch(/pull_request:/);
  });

  it('instala con npm ci y ejecuta lint, build y test', () => {
    expect(ci).toMatch(/run:\s*npm ci/);
    expect(ci).toMatch(/run:\s*npm run lint/);
    expect(ci).toMatch(/run:\s*npm run build/);
    expect(ci).toMatch(/run:\s*npm test\b/);
  });

  it('usa Node 22 como package.json (engines)', () => {
    expect(ci).toMatch(/node-version:\s*22/);
  });

  it('el job de base de datos usa un servicio postgres:16 con healthcheck y corre npm run test:db', () => {
    expect(ci).toMatch(/image:\s*postgres:16/);
    expect(ci).toMatch(/--health-cmd/);
    expect(ci).toMatch(/DATABASE_URL_TEST:\s*postgres:\/\//);
    expect(ci).toMatch(/run:\s*npm run test:db/);
  });

  it('no incrusta secretos reales: la contrasena del servicio es solo de CI y no hay JWT_SECRETO', () => {
    expect(ci).not.toMatch(/JWT_SECRETO/);
    expect(ci).not.toMatch(/ADMIN_PASSWORD/);
  });

  it('cancela ejecuciones obsoletas y limita los permisos del token', () => {
    expect(ci).toMatch(/concurrency:/);
    expect(ci).toMatch(/permissions:\s*\n\s+contents:\s*read/);
  });
});
