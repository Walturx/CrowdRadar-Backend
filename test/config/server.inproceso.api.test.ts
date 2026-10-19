/**
 * Happy path of src/server.ts run in-process: the composition root is replaced by the fake container (no
 * database), everything else is real. Covers what the spawned-process test (server.arranque.api.test.ts) cannot
 * reach without Postgres: the container is wired into a listening HTTP server, the process hooks receive the
 * shutdown and the resource closer, and a SIGTERM-style shutdown closes the server and the connection and exits 0.
 * The process hooks themselves are captured, not installed, so the Vitest worker keeps its own signal handling.
 */
import type { Server } from 'node:http';
import { createServer as crearServidorTcp, type AddressInfo } from 'node:net';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as Contenedor from '../../src/container/index.js';
import type * as ServidorHttp from '../../src/util/servidorHttp.js';
import { ConfiguracionApp } from '../../src/config/ConfiguracionApp.js';
import { ConexionFalsa } from '../support/ConexionFalsa.js';

type ArgsHooks = Parameters<typeof ServidorHttp.instalarHooksProceso>[0];

const espias = vi.hoisted(() => ({
  servidores: [] as Server[],
  hooks: [] as ArgsHooks[],
  crearContenedor: undefined as unknown as ReturnType<typeof vi.fn>,
}));

vi.mock('node:http', async (importOriginal) => {
  const real = await importOriginal<typeof import('node:http')>();
  const createServer = ((...args: Parameters<typeof real.createServer>) => {
    const servidor = real.createServer(...args);
    espias.servidores.push(servidor);
    return servidor;
  }) as typeof real.createServer;
  return { ...real, default: { ...real, createServer }, createServer };
});

vi.mock('../../src/util/servidorHttp.js', async (importOriginal) => {
  const real = await importOriginal<typeof ServidorHttp>();
  return { ...real, instalarHooksProceso: (args: ArgsHooks) => void espias.hooks.push(args) };
});

vi.mock('../../src/container/index.js', async (importOriginal) => {
  const real = await importOriginal<typeof Contenedor>();
  espias.crearContenedor = vi.fn();
  return { ...real, crearContenedor: espias.crearContenedor };
});

async function puertoLibre(): Promise<number> {
  // node:net, not node:http: the http module is wrapped above and would record the probe.
  const sonda = crearServidorTcp();
  await new Promise<void>((listo) => sonda.listen(0, '127.0.0.1', listo));
  const { port } = sonda.address() as AddressInfo;
  await new Promise((listo) => sonda.close(listo));
  return port;
}

describe('server.ts en proceso (contenedor de prueba)', () => {
  let conexion: ConexionFalsa;
  let salir: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    vi.resetModules();
    ConfiguracionApp.reiniciar();
    espias.servidores.length = 0;
    espias.hooks.length = 0;
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('LOG_NIVEL', 'silent');
    vi.stubEnv('DB_PASSWORD', 'clave-de-prueba');
    vi.stubEnv('JWT_SECRETO', 'x'.repeat(40));
    vi.stubEnv('DB_REINTENTOS', '2');
    vi.stubEnv('DB_REINTENTO_ESPERA_MS', '1');
    vi.stubEnv('PUERTO', String(await puertoLibre()));
    salir = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
    conexion = new ConexionFalsa();
    const { crearContenedorPrueba } = await import('../support/crearContenedorPrueba.js');
    espias.crearContenedor.mockReset();
    espias.crearContenedor.mockImplementation(async (_cfg: unknown, _logger: unknown, estado) => crearContenedorPrueba({ conexion, estado }).contenedor);
  });

  afterEach(async () => {
    await Promise.all(espias.servidores.filter((s) => s.listening).map((s) => new Promise((listo) => s.close(listo))));
    salir.mockRestore();
    vi.unstubAllEnvs();
    ConfiguracionApp.reiniciar();
  });

  const arrancar = async () => {
    await import('../../src/server.js');
    await vi.waitFor(() => expect(espias.servidores[0]?.listening).toBe(true));
    return espias.servidores[0]!;
  };

  it('reintenta el contenedor tras un fallo y luego escucha en PUERTO atendiendo /api/salud', async () => {
    espias.crearContenedor.mockRejectedValueOnce(Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' }));
    const servidor = await arrancar();

    expect(espias.crearContenedor).toHaveBeenCalledTimes(2);
    expect((servidor.address() as AddressInfo).port).toBe(Number(process.env.PUERTO));
    const res = await request(servidor).get('/api/salud');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ estado: 'OK' });
    expect(salir).not.toHaveBeenCalled();
  });

  it('instala los hooks con el proceso real; cerrarRecursos cierra la conexion', async () => {
    await arrancar();
    expect(espias.hooks).toHaveLength(1);
    expect(espias.hooks[0]!.proceso).toBe(process);
    await espias.hooks[0]!.cerrarRecursos!();
    expect(conexion.cerrada).toBe(true);
  });

  it('el apagado ordenado deja de aceptar conexiones, cierra la base y sale con el codigo pedido', async () => {
    const servidor = await arrancar();
    await espias.hooks[0]!.apagar('SIGTERM', 0);
    expect(servidor.listening).toBe(false);
    expect(conexion.cerrada).toBe(true);
    expect(salir).toHaveBeenCalledWith(0);
  });

  it('si el contenedor nunca se arma, registra el fallo y sale con 1 sin abrir el puerto', async () => {
    espias.crearContenedor.mockRejectedValue(new Error('sin base'));
    await import('../../src/server.js');
    await vi.waitFor(() => expect(salir).toHaveBeenCalledWith(1));
    expect(espias.crearContenedor).toHaveBeenCalledTimes(2);
    expect(espias.servidores).toHaveLength(0);
  });
});
