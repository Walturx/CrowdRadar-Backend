/**
 * Startup failures of src/server.ts run as a real process (no database needed).
 * Spec: R-A3.2 (fail-fast on bad env) and R-A4.1 (unreachable Postgres at startup).
 */
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const RAIZ = resolve(import.meta.dirname, '..', '..');

function arrancar(env: Record<string, string>): Promise<{ codigo: number | null; salida: string }> {
  return new Promise((resolver, rechazar) => {
    const hijo = spawn(process.execPath, ['--import', 'tsx', 'src/server.ts'], {
      cwd: RAIZ,
      env: { ...process.env, JWT_SECRETO: '', DB_PASSWORD: '', DB_HOST: '', DB_PUERTO: '', PUERTO: '', ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let salida = '';
    hijo.stdout.on('data', (d) => (salida += d));
    hijo.stderr.on('data', (d) => (salida += d));
    const temporizador = setTimeout(() => {
      hijo.kill();
      rechazar(new Error(`El proceso no termino: ${salida}`));
    }, 30000);
    hijo.on('exit', (codigo) => {
      clearTimeout(temporizador);
      resolver({ codigo, salida });
    });
  });
}

describe('arranque de server.ts', () => {
  it('sin JWT_SECRETO sale con codigo 1 y nombra la clave', async () => {
    const { codigo, salida } = await arrancar({ DB_PASSWORD: 'clave' });
    expect(codigo).toBe(1);
    expect(salida).toContain('JWT_SECRETO');
  });

  it('con Postgres inalcanzable sale con codigo 1 y registra el error', async () => {
    const { codigo, salida } = await arrancar({
      DB_PASSWORD: 'clave',
      JWT_SECRETO: 'x'.repeat(40),
      DB_HOST: '127.0.0.1',
      DB_PUERTO: '1',
      PUERTO: '3999',
    });
    expect(codigo).toBe(1);
    expect(salida).toContain('No se pudo iniciar el servidor');
  });
});
