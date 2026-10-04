'use strict';

/**
 * Pure part of the synthetic history seeder (spec M4 R10): who the demo users are, whether seeding is on, and the
 * deterministic generation of about four weeks of reports with a realistic crowd pattern per place category.
 * It lives outside database/seeders because sequelize-cli runs every file of that folder as a seeder.
 *
 * DOMINIO_EMAIL must match src/util/sintetico.ts (the analytics endpoints use it to flag `sintetico: true`);
 * a unit test pins both to the same text.
 */

const DOMINIO_EMAIL = '@sintetico.crowdradar.local';
const CANTIDAD_USUARIOS = 3;
/** Completed days before today that get reports. */
const DIAS_HISTORIAL = 28;
const HORA_APERTURA = 8;
const HORA_CIERRE = 22;
/** America/Lima is UTC-5 all year (no daylight saving). */
const HORAS_DE_DIFERENCIA_LIMA = 5;
const MS_POR_DIA = 86_400_000;
/** Level cut-offs of the 0..1 crowd value. */
const UMBRAL_MODERADO = 0.34;
const UMBRAL_SATURADO = 0.67;
/** Chance that an hour has a report: a quiet hour still gets some, a crowded one almost always. */
const PROBABILIDAD_BASE = 0.45;
const PROBABILIDAD_POR_AFLUENCIA = 0.4;
const RUIDO = 0.24;

const USUARIOS = Array.from({ length: CANTIDAD_USUARIOS }, (_, i) => {
  const numero = String(i + 1).padStart(2, '0');
  return { nombre: `Demo ${numero}`, apellido: 'Sintético', email: `demo${numero}${DOMINIO_EMAIL}` };
});

/** Crowd value 0..1 of a place category: a base plus gaussian peaks [center hour, width, height], weekdays and weekends. */
const PERFILES = {
  PARQUE: { laborable: [0.1, [[18, 1.5, 0.45]]], finDeSemana: [0.15, [[12, 2, 0.35], [16.5, 2.5, 0.6]]] },
  CENTRO_COMERCIAL: { laborable: [0.2, [[13, 1, 0.3], [19.5, 1.8, 0.5]]], finDeSemana: [0.3, [[17, 3.5, 0.65]]] },
  MERCADO: { laborable: [0.2, [[10, 1.8, 0.7]]], finDeSemana: [0.25, [[10.5, 2, 0.7]]] },
  TRANSPORTE: { laborable: [0.2, [[8, 1.2, 0.75], [18, 1.4, 0.75]]], finDeSemana: [0.3, [[13, 3, 0.2]]] },
  PLAZA: { laborable: [0.15, [[13, 1, 0.4], [19, 1.5, 0.45]]], finDeSemana: [0.2, [[18, 2.5, 0.6]]] },
  PLAYA: { laborable: [0.1, [[13, 3, 0.15]]], finDeSemana: [0.1, [[13, 3.5, 0.9]]] },
};
const PERFIL_POR_DEFECTO = PERFILES.PLAZA;

/** True unless the environment turns the demo history off: SEED_SINTETICO wins, otherwise it is on outside production. */
function habilitado(env) {
  const crudo = String(env.SEED_SINTETICO ?? '').trim().toLowerCase();
  if (['true', '1', 'yes', 'on'].includes(crudo)) return true;
  if (['false', '0', 'no', 'off'].includes(crudo)) return false;
  return env.NODE_ENV !== 'production';
}

/** FNV-1a: a stable 32-bit hash of a text. */
function hash(texto) {
  let h = 0x811c9dc5;
  for (let i = 0; i < texto.length; i += 1) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32: small deterministic generator, 0 <= value < 1. */
function generador(semilla) {
  let estado = semilla;
  return () => {
    estado = (estado + 0x6d2b79f5) >>> 0;
    let t = estado;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** `dia` (YYYY-MM-DD) moved by `n` calendar days. */
function sumarDias(dia, n) {
  const [anio, mes, d] = dia.split('-').map(Number);
  return new Date(Date.UTC(anio, mes - 1, d) + n * MS_POR_DIA).toISOString().slice(0, 10);
}

function afluencia(categoria, hora, finDeSemana, aleatorio) {
  const perfil = PERFILES[categoria] ?? PERFIL_POR_DEFECTO;
  const [base, picos] = finDeSemana ? perfil.finDeSemana : perfil.laborable;
  const suma = picos.reduce((total, [centro, ancho, altura]) => total + altura * Math.exp(-(((hora - centro) / ancho) ** 2) / 2), base);
  return Math.min(1, Math.max(0, suma + (aleatorio() - 0.5) * RUIDO));
}

const nivelDe = (valor) => (valor < UMBRAL_MODERADO ? 'TRANQUILO' : valor < UMBRAL_SATURADO ? 'MODERADO' : 'SATURADO');

/**
 * Rows of reporte_saturacion for the DIAS_HISTORIAL days before `hoy` (YYYY-MM-DD, Lima) in every place.
 * Each (place, day) draws from its own generator seeded by that pair, so a day always comes out the same
 * whenever the seeder runs: running it again later only adds the new days.
 */
function generarReportes({ lugares, usuarioIds, hoy }) {
  const filas = [];
  for (const lugar of lugares) {
    for (let atras = DIAS_HISTORIAL; atras >= 1; atras -= 1) {
      const dia = sumarDias(hoy, -atras);
      const [anio, mes, d] = dia.split('-').map(Number);
      const diaDeSemana = new Date(Date.UTC(anio, mes - 1, d)).getUTCDay();
      const finDeSemana = diaDeSemana === 0 || diaDeSemana === 6;
      const aleatorio = generador(hash(`${lugar.id}|${dia}`));
      for (let hora = HORA_APERTURA; hora < HORA_CIERRE; hora += 1) {
        const valor = afluencia(lugar.categoria, hora, finDeSemana, aleatorio);
        const minuto = Math.floor(aleatorio() * 60);
        const autor = usuarioIds[Math.floor(aleatorio() * usuarioIds.length)];
        if (aleatorio() >= PROBABILIDAD_BASE + PROBABILIDAD_POR_AFLUENCIA * valor) continue;
        filas.push({
          usuario_id: autor,
          lugar_id: lugar.id,
          nivel_saturacion: nivelDe(valor),
          fecha_hora: new Date(Date.UTC(anio, mes - 1, d, hora + HORAS_DE_DIFERENCIA_LIMA, minuto)),
        });
      }
    }
  }
  return filas;
}

/** Today in Lima (YYYY-MM-DD). */
const hoyEnLima = (ahora = new Date()) =>
  new Date(ahora.getTime() - HORAS_DE_DIFERENCIA_LIMA * 3_600_000).toISOString().slice(0, 10);

module.exports = { DOMINIO_EMAIL, USUARIOS, DIAS_HISTORIAL, habilitado, generarReportes, hoyEnLima };
