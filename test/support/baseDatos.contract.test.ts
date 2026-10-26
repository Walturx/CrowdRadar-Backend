/**
 * The database test helpers must reuse connections (opt-in: DATABASE_URL_TEST).
 * Opening one client per query left hundreds of sockets in TIME_WAIT per `test:db` run, and on Windows a run could
 * fail with `connect EADDRINUSE` when the ephemeral ports ran out.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { URL_BD_TEST, codigoDeError, consultar, crearBdTemporal, type BaseTemporal } from './baseDatos.js';

const PID = 'SELECT pg_backend_pid() AS pid';

describe.skipIf(!URL_BD_TEST)('baseDatos: reutilizacion de conexiones (PostgreSQL real)', () => {
  let bd: BaseTemporal;

  beforeAll(async () => {
    bd = await crearBdTemporal(URL_BD_TEST as string);
  });

  afterAll(async () => {
    await bd?.eliminar();
  });

  it('consultas seguidas sobre la misma base usan la misma conexion', async () => {
    const [primera] = await consultar<{ pid: number }>(bd.url, PID);
    const [segunda] = await consultar<{ pid: number }>(bd.url, PID);
    expect(segunda!.pid).toBe(primera!.pid);
  });

  it('un error de codigoDeError no rompe la conexion reutilizada', async () => {
    const [antes] = await consultar<{ pid: number }>(bd.url, PID);
    expect(await codigoDeError(bd.url, 'SELECT * FROM tabla_inexistente')).toBe('42P01');
    const [despues] = await consultar<{ pid: number }>(bd.url, PID);
    expect(despues!.pid).toBe(antes!.pid);
  });

  it('eliminar() libera la conexion de la base y la borra', async () => {
    const otra = await crearBdTemporal(URL_BD_TEST as string);
    const nombre = new URL(otra.url).pathname.slice(1);
    await consultar(otra.url, 'SELECT 1');
    await otra.eliminar();
    const filas = await consultar(URL_BD_TEST as string, 'SELECT 1 FROM pg_database WHERE datname = $1', [nombre]);
    expect(filas).toHaveLength(0);
  });

  it('una conexion ociosa terminada por el servidor (como DROP ... WITH (FORCE)) no deja errores sin manejar', async () => {
    const sinManejar: unknown[] = [];
    const anotar = (error: unknown) => sinManejar.push(error);
    process.on('uncaughtException', anotar);
    try {
      const otra = await crearBdTemporal(URL_BD_TEST as string);
      const [vieja] = await consultar<{ pid: number }>(otra.url, PID);
      await consultar(URL_BD_TEST as string, 'SELECT pg_terminate_backend($1)', [vieja!.pid]);
      await new Promise((resolver) => setTimeout(resolver, 300));
      const [nueva] = await consultar<{ pid: number }>(otra.url, PID);
      expect(nueva!.pid).not.toBe(vieja!.pid);
      await otra.eliminar();
    } finally {
      process.off('uncaughtException', anotar);
    }
    expect(sinManejar).toEqual([]);
  });
});
