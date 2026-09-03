/** `npm run test:db` must FAIL when DATABASE_URL_TEST is missing, so DB tests are never silently skipped in CI (R3-204). */
import { execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const RAIZ = resolve(import.meta.dirname, '..', '..');

describe('script test:db', () => {
  it('esta declarado en package.json', () => {
    const paquete = JSON.parse(readFileSync(resolve(RAIZ, 'package.json'), 'utf8')) as { scripts: Record<string, string> };
    expect(paquete.scripts['test:db']).toContain('scripts/test-db.ts');
  });

  it('sin DATABASE_URL_TEST sale con codigo distinto de 0 y lo explica', async () => {
    const resultado = await new Promise<{ codigo: number; salida: string }>((resolver) => {
      execFile(
        process.execPath,
        ['--import', 'tsx', 'scripts/test-db.ts'],
        { cwd: RAIZ, env: { ...process.env, DATABASE_URL_TEST: '' } },
        (error, stdout, stderr) =>
          resolver({ codigo: error ? (typeof error.code === 'number' ? error.code : 1) : 0, salida: `${stdout}${stderr}` }),
      );
    });
    expect(resultado.codigo).not.toBe(0);
    expect(resultado.salida).toContain('DATABASE_URL_TEST');
  });
});
