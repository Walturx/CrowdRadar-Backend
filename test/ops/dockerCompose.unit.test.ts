/**
 * docker-compose hygiene (reviews R1-208, R1-404, R4-410; spec A12.2): loopback-only Postgres, no default
 * password, a one-shot migrate service that the api waits for, and a stop grace period above the shutdown limit.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const RAIZ = resolve(import.meta.dirname, '..', '..');
const compose = readFileSync(resolve(RAIZ, 'docker-compose.yml'), 'utf8').replace(/\r\n/g, '\n');

/** Text of one top-level service block: from `  nombre:` up to the next two-space key or top-level key. */
function servicio(nombre: string): string {
  const lineas = compose.split('\n');
  const inicio = lineas.findIndex((linea) => linea === `  ${nombre}:`);
  expect(inicio, `servicio ${nombre}`).toBeGreaterThanOrEqual(0);
  const resto = lineas.slice(inicio + 1);
  const fin = resto.findIndex((linea) => /^( {2}\S|\S)/.test(linea));
  return (fin === -1 ? resto : resto.slice(0, fin)).join('\n');
}

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

  it('el servicio migrate es de un solo uso: corre db:migrate tras un Postgres sano y no se reinicia (R1-404)', () => {
    const migrate = servicio('migrate');
    expect(migrate).toMatch(/depends_on:\s*\n\s+postgres:\s*\n\s+condition:\s*service_healthy/);
    expect(migrate).toContain('command: ["npm", "run", "db:migrate"]');
    expect(migrate).toMatch(/restart:\s*"no"/);
    expect(migrate).toMatch(/DB_HOST:\s*postgres/);
  });

  it('el servicio api espera a Postgres sano y a que migrate termine bien, y no migra por su cuenta', () => {
    const api = servicio('api');
    expect(api).toMatch(/postgres:\s*\n\s+condition:\s*service_healthy/);
    expect(api).toMatch(/migrate:\s*\n\s+condition:\s*service_completed_successfully/);
    expect(api).not.toContain('db:migrate');
    expect(api).not.toMatch(/command:/);
  });

  it('stop_grace_period cubre APAGADO_TIMEOUT_MS (35 s por defecto) con margen (R4-410)', () => {
    expect(servicio('api')).toMatch(/stop_grace_period:\s*40s/);
  });

  it('el api no hereda un .env completo por accidente: DB_HOST apunta al servicio postgres', () => {
    expect(servicio('api')).toMatch(/DB_HOST:\s*postgres/);
  });

  it('existe el Dockerfile que usan los servicios api y migrate', () => {
    expect(servicio('api')).toMatch(/build:\s*\./);
    expect(servicio('migrate')).toMatch(/build:\s*\./);
    expect(existsSync(resolve(RAIZ, 'Dockerfile'))).toBe(true);
    expect(existsSync(resolve(RAIZ, '.dockerignore'))).toBe(true);
  });
});
