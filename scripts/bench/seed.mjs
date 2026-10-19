/**
 * `npm run bench:seed`: repeatable load-test dataset in the docker database. It first deletes every previous bench row
 * (users @bench.crowdradar.local, places with osm_id >= 9e9, and whatever points at them), then inserts:
 * 200 places over the six categories inside Lima, 100 users (one shared password, BENCH_PASSWORD), 5000 reports spread
 * over the last 7 days (all older than 35 minutes, so the 30-minute report cooldown never blocks the POST scenario) and
 * 150 reports with 1-4 pending denuncias each (8 pages of GET /api/admin/reportes-denunciados at size 20).
 * Random choices come from a fixed-seed generator, so two runs give the same shape (timestamps are relative to now).
 * Usage: node scripts/bench/seed.mjs [--solo-limpiar]
 */
import process from 'node:process';
import bcrypt from 'bcrypt';
import {
  DOMINIO_EMAIL_BENCH,
  OSM_ID_BASE_BENCH,
  PASSWORD_BENCH,
  TOTAL_LUGARES_BENCH,
  TOTAL_USUARIOS_BENCH,
  conectar,
  emailBench,
  escribir,
} from './comun.mjs';

const TOTAL_REPORTES = 5000;
const TOTAL_REPORTES_DENUNCIADOS = 150;
const CATEGORIAS = ['PARQUE', 'CENTRO_COMERCIAL', 'MERCADO', 'TRANSPORTE', 'PLAZA', 'PLAYA'];
const NIVELES = ['TRANQUILO', 'MODERADO', 'SATURADO'];
const MOTIVOS = ['INFORMACION_FALSA', 'SPAM', 'CONTENIDO_INAPROPIADO', 'OTRO'];
const MS_MINUTO = 60_000;
const VENTANA_MS = 7 * 24 * 60 * MS_MINUTO;
const MARGEN_COOLDOWN_MS = 35 * MS_MINUTO;
// Lima metropolitan area.
const LIMA = { minLat: -12.2, maxLat: -11.95, minLng: -77.12, maxLng: -76.9 };

/** mulberry32: small deterministic PRNG. */
function generador(semilla) {
  let estado = semilla >>> 0;
  return () => {
    estado = (estado + 0x6d2b79f5) >>> 0;
    let t = estado;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const azar = generador(20261018);
const entero = (max) => Math.floor(azar() * max);
const elegir = (lista) => lista[entero(lista.length)];

async function limpiar(cliente) {
  const usuarios = `SELECT id FROM usuario WHERE email LIKE '%${DOMINIO_EMAIL_BENCH}'`;
  const lugares = `SELECT id FROM lugar WHERE osm_id >= ${OSM_ID_BASE_BENCH}`;
  // Denuncias and validations of these reports go with them (ON DELETE CASCADE).
  await cliente.query(`DELETE FROM reporte_saturacion WHERE usuario_id IN (${usuarios}) OR lugar_id IN (${lugares})`);
  await cliente.query(`DELETE FROM usuario WHERE email LIKE '%${DOMINIO_EMAIL_BENCH}'`);
  await cliente.query(`DELETE FROM lugar WHERE osm_id >= ${OSM_ID_BASE_BENCH}`);
}

async function insertarLugares(cliente) {
  const filas = Array.from({ length: TOTAL_LUGARES_BENCH }, (_, i) => {
    const categoria = CATEGORIAS[i % CATEGORIAS.length];
    const conHorario = i % 3 !== 0;
    return [
      OSM_ID_BASE_BENCH + i,
      `Bench ${categoria} ${String(i + 1).padStart(3, '0')}`,
      `Av. Bench ${i + 1}, Lima`,
      (LIMA.minLat + azar() * (LIMA.maxLat - LIMA.minLat)).toFixed(6),
      (LIMA.minLng + azar() * (LIMA.maxLng - LIMA.minLng)).toFixed(6),
      categoria,
      elegir(NIVELES),
      conHorario ? 6 + entero(4) : null,
      conHorario ? 20 + entero(5) : null,
    ];
  });
  const columnas = (k) => filas.map((f) => f[k]);
  const { rows } = await cliente.query(
    `INSERT INTO lugar (osm_id, nombre, direccion, latitud, longitud, categoria, saturacion_actual, saturacion_actualizada_en,
                        hora_apertura, hora_cierre, osm_tipo)
     SELECT o, n, d, la, lo, c, s, now() - interval '40 minutes', ha, hc, 'node'
       FROM unnest($1::bigint[], $2::text[], $3::text[], $4::numeric[], $5::numeric[], $6::text[], $7::text[],
                   $8::smallint[], $9::smallint[]) AS t(o, n, d, la, lo, c, s, ha, hc)
     RETURNING id`,
    [0, 1, 2, 3, 4, 5, 6, 7, 8].map(columnas),
  );
  return rows.map((r) => r.id);
}

async function insertarUsuarios(cliente) {
  const hash = await bcrypt.hash(PASSWORD_BENCH, Number(process.env.BCRYPT_COSTO ?? 10));
  const emails = Array.from({ length: TOTAL_USUARIOS_BENCH }, (_, i) => emailBench(i + 1));
  const karma = emails.map(() => entero(400));
  const { rows } = await cliente.query(
    `INSERT INTO usuario (nombre, apellido, email, password_hash, rol, status, puntos_karma)
     SELECT 'Bench', 'Usuario ' || ord, e, $2, 'USUARIO', 'ACTIVO', k
       FROM unnest($1::text[], $3::int[]) WITH ORDINALITY AS t(e, k, ord)
     ORDER BY ord
     RETURNING id`,
    [emails, hash, karma],
  );
  return rows.map((r) => r.id);
}

async function insertarReportes(cliente, usuarioIds, lugarIds) {
  const ahora = Date.now();
  const usuarios = [];
  const lugares = [];
  const niveles = [];
  const fechas = [];
  const puntos = [];
  for (let i = 0; i < TOTAL_REPORTES; i += 1) {
    usuarios.push(elegir(usuarioIds));
    lugares.push(elegir(lugarIds));
    niveles.push(elegir(NIVELES));
    fechas.push(new Date(ahora - MARGEN_COOLDOWN_MS - azar() * (VENTANA_MS - MARGEN_COOLDOWN_MS)).toISOString());
    puntos.push(azar() < 0.7 ? 10 : 0);
  }
  const { rows } = await cliente.query(
    `INSERT INTO reporte_saturacion (usuario_id, lugar_id, nivel_saturacion, fecha_hora, nivel_confiabilidad, estado,
                                     puntos_otorgados, motivo_sin_puntos)
     SELECT u, l, n, f, NULL, 'ACTIVO', p, CASE WHEN p = 0 THEN 'TOPE_DIARIO' END
       FROM unnest($1::int[], $2::int[], $3::text[], $4::timestamptz[], $5::smallint[]) AS t(u, l, n, f, p)
     RETURNING id, usuario_id`,
    [usuarios, lugares, niveles, fechas, puntos],
  );
  return rows;
}

async function insertarDenuncias(cliente, reportes, usuarioIds) {
  const elegidos = reportes.slice(0, TOTAL_REPORTES_DENUNCIADOS);
  const reporteIds = [];
  const denunciantes = [];
  const motivos = [];
  const detalles = [];
  for (const reporte of elegidos) {
    const cuantos = 1 + entero(4);
    const usados = new Set([reporte.usuario_id]);
    while (usados.size < cuantos + 1) {
      const denunciante = elegir(usuarioIds);
      if (usados.has(denunciante)) continue;
      usados.add(denunciante);
      const motivo = elegir(MOTIVOS);
      reporteIds.push(reporte.id);
      denunciantes.push(denunciante);
      motivos.push(motivo);
      detalles.push(motivo === 'OTRO' ? 'Dato de prueba de carga' : null);
    }
  }
  await cliente.query(
    `INSERT INTO denuncia (reporte_id, usuario_id, motivo, detalle, estado, fecha_hora)
     SELECT r, u, m, d, 'PENDIENTE', now() - (random() * interval '2 days')
       FROM unnest($1::int[], $2::int[], $3::text[], $4::text[]) AS t(r, u, m, d)`,
    [reporteIds, denunciantes, motivos, detalles],
  );
  return reporteIds.length;
}

async function main() {
  const soloLimpiar = process.argv.includes('--solo-limpiar');
  const cliente = await conectar();
  try {
    await cliente.query('BEGIN');
    await limpiar(cliente);
    if (!soloLimpiar) {
      const lugarIds = await insertarLugares(cliente);
      const usuarioIds = await insertarUsuarios(cliente);
      const reportes = await insertarReportes(cliente, usuarioIds, lugarIds);
      const denuncias = await insertarDenuncias(cliente, reportes, usuarioIds);
      escribir(
        `bench seed: ${lugarIds.length} lugares, ${usuarioIds.length} usuarios, ${reportes.length} reportes, ` +
          `${denuncias} denuncias sobre ${TOTAL_REPORTES_DENUNCIADOS} reportes`,
      );
    } else {
      escribir('bench seed: datos de bench eliminados');
    }
    await cliente.query('COMMIT');
  } catch (err) {
    await cliente.query('ROLLBACK');
    throw err;
  } finally {
    await cliente.end();
  }
}

main().catch((err) => {
  process.stderr.write(`${err.stack ?? err}\n`);
  process.exit(1);
});
