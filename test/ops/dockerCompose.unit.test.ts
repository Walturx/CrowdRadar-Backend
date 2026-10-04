/** docker-compose hygiene (reviews R1-208, spec A12.2): loopback-only Postgres, no default password, api waits for health. */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const RAIZ = resolve(import.meta.dirname, '..', '..');
const compose = readFileSync(resolve(RAIZ, 'docker-compose.yml'), 'utf8');

describe('docker-compose.yml', () => {
  it('publica Postgres solo en 127.0.0.1', () => {
    expect(compose).toMatch(/-\s*"127\.0\.0\.1:\$\{DB_PUERTO:-5432\}:5432"/);
    expect(compose).not.toMatch(/-\s*"\$\{DB_PUERTO:-5432\}:5432"/);
    expect(compose).not.toMatch(/-\s*"?5432:5432"?/);
  });

  it('no trae una contrasena por defecto: DB_PASSWORD es obligatoria', () => {
    expect(compose).not.toMatch(/DB_PASSWORD:-/);
    expect(compose).toMatch(/\$\{DB_PASSWORD:\?[^}]+\}/);
    expect(compose).not.toContain('cambiar-password-local');
  });

  it('el servicio api espera a que Postgres este sano', () => {
    expect(compose).toMatch(/^\s{2}api:/m);
    expect(compose).toMatch(/depends_on:\s*\n\s+postgres:\s*\n\s+condition:\s*service_healthy/);
    expect(compose).toContain('npm run db:migrate && node dist/server.js');
  });

  it('el api no hereda un .env completo por accidente: DB_HOST apunta al servicio postgres', () => {
    expect(compose).toMatch(/DB_HOST:\s*postgres/);
  });

  it('existe el Dockerfile que usa el servicio api', () => {
    expect(compose).toMatch(/build:\s*\./);
    expect(existsSync(resolve(RAIZ, 'Dockerfile'))).toBe(true);
    expect(existsSync(resolve(RAIZ, '.dockerignore'))).toBe(true);
  });
});
