/**
 * `npm run bench`: load benchmark (autocannon) of five endpoints against a running API (docker compose, :3000).
 *
 * Usage: npm run bench -- [--seed] [--escenario=lugares,explorar,historial,denunciados,reportes]
 *                         [--duracion=30] [--conexiones=50] [--calentamiento=3] [--salida=bench-results/x.json]
 *                         [--reportes-un-usuario]
 * Env: BENCH_URL (default http://localhost:3000), BENCH_PASSWORD, BENCH_DB_PUERTO (default 55432).
 *
 * Sessions: the admin and bench001 log in through POST /api/auth/login. The login limiter allows LIMITE_LOGIN attempts
 * per IP every LIMITE_VENTANA_MIN, so the other 99 bench users get a token signed with the API's own JWT_SECRETO
 * (same HS256 claims as JwtEmisorTokenAdapter); `autenticar` still re-reads each user from the database, so every
 * request goes through the real auth path. If a login answers 429, that session falls back to a signed token too.
 *
 * POST /api/reportes: each request uses a distinct (user, place) pair (100 x 200 = 20000 pairs), so the 30-minute
 * per-user-per-place cooldown is only reached if the run exhausts the pairs. By default consecutive requests come from
 * different users AND hit different places (request i: user i mod 100, place (i + 101 * floor(i / 100)) mod 200), as
 * real traffic does. `--reportes-un-usuario` restores the order of the baseline (docs/metricas-baseline.md): 200
 * consecutive requests of ONE user on different places, so the in-flight reports all queue on that user's karma lock
 * (pg_advisory_xact_lock(usuario, 0), which keeps the daily cap exact); it measures that lock, not the endpoint.
 * Leftover bench reports younger than 31 minutes (from a previous run) are deleted first.
 *
 * Latency percentiles are computed from every response time (autocannon's own histogram has no p95); 429 is counted
 * apart from the other 4xx.
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import process from 'node:process';
import autocannon from 'autocannon';
import jwt from 'jsonwebtoken';
import { DOMINIO_EMAIL_BENCH, OSM_ID_BASE_BENCH, PASSWORD_BENCH, conectar, emailBench, escribir } from './comun.mjs';

const ESCENARIOS = ['lugares', 'explorar', 'historial', 'denunciados', 'reportes'];
const BASE = process.env.BENCH_URL ?? 'http://localhost:3000';
const ZONA = process.env.ZONA_HORARIA ?? 'America/Lima';
const TAMANO_PAGINA = 20;
const NIVELES = ['TRANQUILO', 'MODERADO', 'SATURADO'];

function argumentos() {
  const opciones = { escenarios: ESCENARIOS, duracion: 30, conexiones: 50, calentamiento: 3, seed: false, salida: null, reportesUnUsuario: false };
  for (const arg of process.argv.slice(2)) {
    const [clave, valor] = arg.replace(/^--/, '').split('=');
    if (clave === 'seed') opciones.seed = true;
    else if (clave === 'reportes-un-usuario') opciones.reportesUnUsuario = true;
    else if (clave === 'escenario') opciones.escenarios = valor.split(',').filter((e) => ESCENARIOS.includes(e));
    else if (clave === 'duracion') opciones.duracion = Number(valor);
    else if (clave === 'conexiones') opciones.conexiones = Number(valor);
    else if (clave === 'calentamiento') opciones.calentamiento = Number(valor);
    else if (clave === 'salida') opciones.salida = valor;
    else throw new Error(`Argumento desconocido: ${arg}`);
  }
  if (opciones.escenarios.length === 0) throw new Error(`Escenarios validos: ${ESCENARIOS.join(', ')}`);
  return opciones;
}

const firmar = (usuario) =>
  jwt.sign(
    { sub: String(usuario.id), id: usuario.id, email: usuario.email, rol: usuario.rol, status: usuario.status },
    process.env.JWT_SECRETO,
    { algorithm: 'HS256', expiresIn: process.env.JWT_EXPIRA_EN ?? '2h' },
  );

/** Real login; on 429 (login limiter) falls back to a signed token and says so. */
async function sesion(email, password, usuario) {
  const respuesta = await globalThis.fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (respuesta.ok) return { token: (await respuesta.json()).data.token, origen: 'login' };
  if (respuesta.status === 429 && usuario) return { token: firmar(usuario), origen: 'firmado (login 429)' };
  throw new Error(`Login de ${email} respondio ${respuesta.status}: ${await respuesta.text()}`);
}

const hoyEn = (zona, desplazamientoDias = 0) => {
  const fecha = new Date(Date.now() + desplazamientoDias * 86_400_000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: zona, year: 'numeric', month: '2-digit', day: '2-digit' }).format(fecha);
};

function percentil(ordenados, p) {
  if (ordenados.length === 0) return null;
  const indice = Math.min(ordenados.length - 1, Math.ceil((p / 100) * ordenados.length) - 1);
  return Math.round(ordenados[Math.max(0, indice)] * 100) / 100;
}

/** One autocannon run; `medir` false is the discarded warm-up. */
function correr({ titulo, opciones, duracion, conexiones, medir }) {
  return new Promise((resolver, rechazar) => {
    const tiempos = [];
    const estados = {};
    const instancia = autocannon({ url: BASE, connections: conexiones, duration: duracion, timeout: 10, ...opciones }, (err, r) => {
      if (err) return rechazar(err);
      if (!medir) return resolver(null);
      tiempos.sort((a, b) => a - b);
      const cuenta = (desde, hasta, excluir = []) =>
        Object.entries(estados)
          .filter(([s]) => Number(s) >= desde && Number(s) < hasta && !excluir.includes(Number(s)))
          .reduce((t, [, n]) => t + n, 0);
      resolver({
        escenario: titulo,
        duracionS: duracion,
        conexiones,
        totalRespuestas: tiempos.length,
        reqPorSegundo: Math.round((tiempos.length / duracion) * 10) / 10,
        latenciaMs: {
          p50: percentil(tiempos, 50),
          p95: percentil(tiempos, 95),
          p99: percentil(tiempos, 99),
          max: percentil(tiempos, 100),
          promedio: tiempos.length ? Math.round((tiempos.reduce((a, b) => a + b, 0) / tiempos.length) * 100) / 100 : null,
        },
        estados,
        resumen: {
          '2xx': cuenta(200, 300),
          '4xx_sin_429': cuenta(400, 500, [429]),
          '429': estados['429'] ?? 0,
          '5xx': cuenta(500, 600),
          erroresConexion: r.errors,
          timeouts: r.timeouts,
        },
        autocannon: { p50: r.latency.p50, p97_5: r.latency.p97_5, p99: r.latency.p99, reqPorSegundoPromedio: r.requests.average },
      });
    });
    instancia.on('response', (_cliente, estado, _bytes, tiempo) => {
      if (!medir) return;
      tiempos.push(tiempo);
      estados[estado] = (estados[estado] ?? 0) + 1;
    });
  });
}

async function prepararDatos() {
  const cliente = await conectar();
  try {
    const usuarios = (
      await cliente.query(
        `SELECT id, email, rol, status FROM usuario WHERE email LIKE '%${DOMINIO_EMAIL_BENCH}' ORDER BY email`,
      )
    ).rows;
    const lugares = (await cliente.query(`SELECT id FROM lugar WHERE osm_id >= ${OSM_ID_BASE_BENCH} ORDER BY id`)).rows.map((r) => r.id);
    const admin = (await cliente.query('SELECT id, email, rol, status FROM usuario WHERE email = $1', [process.env.ADMIN_EMAIL])).rows[0];
    if (usuarios.length === 0 || lugares.length === 0) throw new Error('No hay datos de bench: ejecute npm run bench:seed (o --seed).');
    return { usuarios, lugares, admin };
  } finally {
    await cliente.end();
  }
}

async function limpiarReportesRecientes() {
  const cliente = await conectar();
  try {
    const { rowCount } = await cliente.query(
      `DELETE FROM reporte_saturacion
        WHERE usuario_id IN (SELECT id FROM usuario WHERE email LIKE '%${DOMINIO_EMAIL_BENCH}')
          AND fecha_hora > now() - interval '31 minutes'`,
    );
    return rowCount;
  } finally {
    await cliente.end();
  }
}

/**
 * Pair of request `i` of the reports scenario. Every user gets all 200 places before any pair repeats: for a fixed user
 * u = i mod 100 the place index is (u + 101k) mod 200 with k = floor(i / 100), and 101 is coprime with 200.
 */
export function parReporte(i, totalUsuarios, totalLugares, unUsuario) {
  if (unUsuario) return { usuario: Math.floor(i / totalLugares) % totalUsuarios, lugar: i % totalLugares };
  return { usuario: i % totalUsuarios, lugar: (i + (totalUsuarios + 1) * Math.floor(i / totalUsuarios)) % totalLugares };
}

function escenarios({ tokenUsuario, tokenAdmin, tokens, lugares, reportesUnUsuario }) {
  const auth = (token) => ({ authorization: `Bearer ${token}` });
  const desde = hoyEn(ZONA, -6);
  const hasta = hoyEn(ZONA);
  let pagina = 0;
  let historial = 0;
  let par = 0;
  return {
    lugares: {
      metodo: 'GET /api/lugares?bbox=<Lima>',
      opciones: { requests: [{ method: 'GET', path: '/api/lugares?bbox=-77.15,-12.25,-76.85,-11.9', headers: auth(tokenUsuario) }] },
    },
    explorar: {
      metodo: 'GET /api/lugares/explorar?lat&lng&radioKm=5',
      opciones: {
        requests: [{ method: 'GET', path: '/api/lugares/explorar?lat=-12.08&lng=-77.03&radioKm=5', headers: auth(tokenUsuario) }],
      },
    },
    historial: {
      metodo: `GET /api/lugares/:id/historial?desde=${desde}&hasta=${hasta} (200 lugares rotando)`,
      opciones: {
        requests: [
          {
            method: 'GET',
            headers: auth(tokenUsuario),
            setupRequest: (req) => {
              const id = lugares[historial++ % lugares.length];
              return { ...req, path: `/api/lugares/${id}/historial?desde=${desde}&hasta=${hasta}` };
            },
          },
        ],
      },
    },
    denunciados: {
      metodo: `GET /api/admin/reportes-denunciados?page=1..8&size=${TAMANO_PAGINA} (admin)`,
      opciones: {
        requests: [
          {
            method: 'GET',
            headers: auth(tokenAdmin),
            setupRequest: (req) => ({ ...req, path: `/api/admin/reportes-denunciados?page=${(pagina++ % 8) + 1}&size=${TAMANO_PAGINA}` }),
          },
        ],
      },
    },
    reportes: {
      metodo: `POST /api/reportes (par usuario/lugar distinto por peticion${reportesUnUsuario ? ', un usuario a la vez' : ', usuarios rotando'})`,
      antes: limpiarReportesRecientes,
      opciones: {
        requests: [
          {
            method: 'POST',
            path: '/api/reportes',
            setupRequest: (req) => {
              const i = par++;
              const { usuario, lugar } = parReporte(i, tokens.length, lugares.length, reportesUnUsuario);
              const lugarId = lugares[lugar];
              const token = tokens[usuario];
              return {
                ...req,
                headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
                body: JSON.stringify({ lugarId, nivel: NIVELES[i % NIVELES.length] }),
              };
            },
          },
        ],
      },
    },
  };
}

async function main() {
  const opciones = argumentos();
  if (opciones.seed) {
    const r = spawnSync(process.execPath, ['scripts/bench/seed.mjs'], { stdio: 'inherit' });
    if (r.status !== 0) throw new Error('Fallo el seed de bench');
  }
  const { usuarios, lugares, admin } = await prepararDatos();
  const sesionAdmin = await sesion(process.env.ADMIN_EMAIL, process.env.ADMIN_PASSWORD, admin);
  const sesionUsuario = await sesion(emailBench(1), PASSWORD_BENCH, usuarios[0]);
  const tokens = [sesionUsuario.token, ...usuarios.slice(1).map(firmar)];
  escribir(`sesiones: admin=${sesionAdmin.origen}, bench001=${sesionUsuario.origen}, ${tokens.length - 1} firmados con JWT_SECRETO`);

  const definiciones = escenarios({
    tokenUsuario: sesionUsuario.token,
    tokenAdmin: sesionAdmin.token,
    tokens,
    lugares,
    reportesUnUsuario: opciones.reportesUnUsuario,
  });
  const resultados = [];
  for (const nombre of opciones.escenarios) {
    const def = definiciones[nombre];
    if (def.antes) escribir(`${nombre}: ${await def.antes()} reportes recientes de bench eliminados`);
    if (opciones.calentamiento > 0) {
      await correr({ titulo: nombre, opciones: def.opciones, duracion: opciones.calentamiento, conexiones: opciones.conexiones, medir: false });
    }
    const r = await correr({ titulo: nombre, opciones: def.opciones, duracion: opciones.duracion, conexiones: opciones.conexiones, medir: true });
    r.peticion = def.metodo;
    resultados.push(r);
    escribir(
      `${nombre.padEnd(12)} p50=${r.latenciaMs.p50}ms p95=${r.latenciaMs.p95}ms p99=${r.latenciaMs.p99}ms ` +
        `req/s=${r.reqPorSegundo} 2xx=${r.resumen['2xx']} 4xx=${r.resumen['4xx_sin_429']} 429=${r.resumen['429']} ` +
        `5xx=${r.resumen['5xx']} err=${r.resumen.erroresConexion} timeouts=${r.resumen.timeouts}`,
    );
  }

  const salida = opciones.salida ?? `bench-results/bench-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  mkdirSync(dirname(salida), { recursive: true });
  const informe = { fecha: new Date().toISOString(), base: BASE, node: process.version, opciones, resultados };
  writeFileSync(salida, `${JSON.stringify(informe, null, 2)}\n`);
  escribir(`resultados: ${salida}`);
}

// Run only as a script (`npm run bench`); importing the module (tests of parReporte) must not start a benchmark.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    process.stderr.write(`${err.stack ?? err}\n`);
    process.exit(1);
  });
}
