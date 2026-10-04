/**
 * sequelize-cli side of the setup: TLS verification (R1-209) and the admin seeder's input checks.
 * Both files are CommonJS, so they are exercised through createRequire / a child process.
 */
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const RAIZ = resolve(import.meta.dirname, '..', '..');
const requerir = createRequire(import.meta.url);

function configCli(env: Record<string, string>) {
  const salida = execFileSync(
    process.execPath,
    ['-e', "process.stdout.write(JSON.stringify(require('./database/config.cjs').production))"],
    { cwd: RAIZ, env: { PATH: process.env.PATH ?? '', ...env } },
  );
  return JSON.parse(salida.toString()) as { dialectOptions: Record<string, unknown> };
}

describe('database/config.cjs', () => {
  it('con DB_SSL=true exige TLS y VERIFICA el certificado del servidor', () => {
    expect(configCli({ DB_SSL: 'true' }).dialectOptions).toEqual({ ssl: { require: true, rejectUnauthorized: true } });
  });

  it('sin DB_SSL no activa TLS', () => {
    expect(configCli({}).dialectOptions).toEqual({});
  });
});

describe('seeder usuario-admin', () => {
  const seeder = requerir('../../database/seeders/20261005100001-usuario-admin.cjs') as {
    up(queryInterface: unknown): Promise<void>;
  };
  const consultas: unknown[] = [];
  const queryInterface = { sequelize: { query: async (...argumentos: unknown[]) => void consultas.push(argumentos) } };

  const sembrar = (env: Record<string, string>) => {
    const anterior = { ...process.env };
    Object.assign(process.env, { ADMIN_EMAIL: '', ADMIN_PASSWORD: '', BCRYPT_COSTO: '4', ...env });
    return seeder.up(queryInterface).finally(() => {
      process.env = anterior;
    });
  };

  it.each([
    ['sin credenciales', {}],
    ['password de menos de 10 caracteres', { ADMIN_EMAIL: 'a@b.pe', ADMIN_PASSWORD: 'Corta123' }],
    ['password placeholder', { ADMIN_EMAIL: 'a@b.pe', ADMIN_PASSWORD: 'CAMBIAR_PASSWORD_ADMIN' }],
  ])('se niega a sembrar %s', async (_caso, env) => {
    await expect(sembrar(env)).rejects.toThrow(/ADMIN_PASSWORD|ADMIN_EMAIL/);
    expect(consultas).toHaveLength(0);
  });

  it('siembra con credenciales validas (guarda hash bcrypt, nunca la clave)', async () => {
    await sembrar({ ADMIN_EMAIL: 'Admin@CrowdRadar.pe', ADMIN_PASSWORD: 'UnaClaveDeAdmin123' });
    expect(consultas).toHaveLength(1);
    const [, opciones] = consultas[0] as [string, { replacements: { email: string; hash: string } }];
    expect(opciones.replacements.email).toBe('admin@crowdradar.pe');
    expect(opciones.replacements.hash).toMatch(/^\$2[aby]\$04\$/);
  });
});
