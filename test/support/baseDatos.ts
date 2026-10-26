/**
 * Helpers for the opt-in database tests (DATABASE_URL_TEST). They create throwaway
 * databases next to the configured one and run sequelize-cli as a child process.
 *
 * Queries go through one small pool per database URL and test worker. Opening a client per query left hundreds of
 * sockets in TIME_WAIT per `test:db` run, and on Windows a run could fail with `connect EADDRINUSE`.
 */
import { execFile } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import pg from 'pg';

export const URL_BD_TEST = process.env.DATABASE_URL_TEST;

const RAIZ = resolve(import.meta.dirname, '..', '..');
const BIN_CLI = resolve(RAIZ, 'node_modules', 'sequelize-cli', 'lib', 'sequelize');

export interface BaseTemporal {
  url: string;
  eliminar(): Promise<void>;
}

function conBd(url: string, nombre: string): string {
  const copia = new URL(url);
  copia.pathname = `/${nombre}`;
  return copia.toString();
}

const pools = new Map<string, pg.Pool>();

/** The worker's pool for `url`. Idle clients stay open (no idle timeout) and never keep the worker alive. */
function poolDe(url: string): pg.Pool {
  let pool = pools.get(url);
  if (!pool) {
    pool = new pg.Pool({ connectionString: url, max: 4, idleTimeoutMillis: 0, allowExitOnIdle: true });
    // An IDLE client killed by the server (`DROP DATABASE ... WITH (FORCE)`, a restart) is only discarded by the pool;
    // without a listener that `error` event would crash the worker. Queries in flight still reject as usual.
    pool.on('error', () => {});
    pools.set(url, pool);
  }
  return pool;
}

async function cerrarPool(url: string): Promise<void> {
  const pool = pools.get(url);
  if (!pool) return;
  pools.delete(url);
  await pool.end();
}

/** Creates an empty database named crowdradar_tmp_<random> and returns how to drop it. */
export async function crearBdTemporal(urlBase: string): Promise<BaseTemporal> {
  const nombre = `crowdradar_tmp_${randomBytes(4).toString('hex')}`;
  const admin = poolDe(conBd(urlBase, 'postgres'));
  await admin.query(`CREATE DATABASE ${nombre}`);
  const url = conBd(urlBase, nombre);
  return {
    url,
    async eliminar() {
      // Drop first: the pool still owns its clients when FORCE terminates them. Ending it first could leave a client
      // half-closed and outside the pool, and FORCE's termination would then reach it with no error listener.
      await admin.query(`DROP DATABASE IF EXISTS ${nombre} WITH (FORCE)`);
      await cerrarPool(url);
    },
  };
}

/** Environment variables (DB_*) that database/config.cjs reads, derived from a connection URL. */
export function entornoBd(url: string): Record<string, string> {
  const partes = new URL(url);
  return {
    DB_HOST: partes.hostname,
    DB_PUERTO: partes.port || '5432',
    DB_NOMBRE: partes.pathname.slice(1),
    DB_USUARIO: decodeURIComponent(partes.username),
    DB_PASSWORD: decodeURIComponent(partes.password),
  };
}

export interface ResultadoCli {
  codigo: number;
  salida: string;
}

/** Runs `sequelize-cli <args>` against `url`; never rejects, check `codigo`. */
export function ejecutarCli(args: string[], url: string, extraEnv: Record<string, string> = {}): Promise<ResultadoCli> {
  return new Promise((resolver) => {
    execFile(
      process.execPath,
      [BIN_CLI, ...args],
      { cwd: RAIZ, env: { ...process.env, ...entornoBd(url), ...extraEnv } },
      (error, stdout, stderr) => {
        const codigo = error ? (typeof error.code === 'number' ? error.code : 1) : 0;
        resolver({ codigo, salida: `${stdout}${stderr}` });
      },
    );
  });
}

/** One-shot query helper. */
export async function consultar<T extends pg.QueryResultRow = pg.QueryResultRow>(
  url: string,
  sql: string,
  parametros: unknown[] = [],
): Promise<T[]> {
  // Not `pool.query`: it discards the client on ANY error, so every `codigoDeError` would open a new connection.
  // A statement rejected by PostgreSQL leaves the connection usable; only connection-level errors discard it.
  const cliente = await poolDe(url).connect();
  let roto: Error | undefined;
  try {
    return (await cliente.query<T>(sql, parametros)).rows;
  } catch (error) {
    if (!(error instanceof pg.DatabaseError)) roto = error as Error;
    throw error;
  } finally {
    cliente.release(roto);
  }
}

/** Runs a statement and returns the PostgreSQL error code (e.g. 23505) or undefined when it succeeds. */
export async function codigoDeError(url: string, sql: string, parametros: unknown[] = []): Promise<string | undefined> {
  try {
    await consultar(url, sql, parametros);
    return undefined;
  } catch (error) {
    return (error as { code?: string }).code;
  }
}
