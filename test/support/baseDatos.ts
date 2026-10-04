/**
 * Helpers for the opt-in database tests (DATABASE_URL_TEST). They create throwaway
 * databases next to the configured one and run sequelize-cli as a child process.
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

/** Creates an empty database named crowdradar_tmp_<random> and returns how to drop it. */
export async function crearBdTemporal(urlBase: string): Promise<BaseTemporal> {
  const nombre = `crowdradar_tmp_${randomBytes(4).toString('hex')}`;
  const admin = new pg.Client({ connectionString: conBd(urlBase, 'postgres') });
  await admin.connect();
  await admin.query(`CREATE DATABASE ${nombre}`);
  await admin.end();
  return {
    url: conBd(urlBase, nombre),
    async eliminar() {
      const cliente = new pg.Client({ connectionString: conBd(urlBase, 'postgres') });
      await cliente.connect();
      await cliente.query(`DROP DATABASE IF EXISTS ${nombre} WITH (FORCE)`);
      await cliente.end();
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
  const cliente = new pg.Client({ connectionString: url });
  await cliente.connect();
  try {
    return (await cliente.query<T>(sql, parametros)).rows;
  } finally {
    await cliente.end();
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
