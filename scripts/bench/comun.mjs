/**
 * Shared settings of the load benchmark (scripts/bench). Reads the same .env as the API and only ever talks to the
 * docker compose database (127.0.0.1:55432 by default): any other port must be named explicitly with BENCH_DB_PUERTO.
 */
import process from 'node:process';
import dotenv from 'dotenv';
import pg from 'pg';

dotenv.config({ quiet: true });

/** Bench data is recognisable by these markers, so a reset never touches real or synthetic demo rows. */
export const DOMINIO_EMAIL_BENCH = '@bench.crowdradar.local';
export const OSM_ID_BASE_BENCH = 9_000_000_000;
export const TOTAL_USUARIOS_BENCH = 100;
export const TOTAL_LUGARES_BENCH = 200;
export const PASSWORD_BENCH = process.env.BENCH_PASSWORD ?? 'BenchCrowdRadar2026';

const PUERTO_DOCKER = 55432;

export function escribir(linea) {
  process.stdout.write(`${linea}\n`);
}

/** Connection to the bench database; refuses production and any port other than the docker one unless overridden. */
export async function conectar() {
  if (process.env.NODE_ENV === 'production') throw new Error('El bench no corre con NODE_ENV=production.');
  const puerto = Number(process.env.BENCH_DB_PUERTO ?? PUERTO_DOCKER);
  const cliente = new pg.Client({
    host: process.env.BENCH_DB_HOST ?? '127.0.0.1',
    port: puerto,
    database: process.env.DB_NOMBRE ?? 'crowdradar',
    user: process.env.DB_USUARIO ?? 'crowdradar',
    password: process.env.DB_PASSWORD,
  });
  await cliente.connect();
  return cliente;
}

export const emailBench = (indice) => `bench${String(indice).padStart(3, '0')}${DOMINIO_EMAIL_BENCH}`;
