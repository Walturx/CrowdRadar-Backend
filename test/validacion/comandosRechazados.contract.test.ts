/**
 * A rejected command leaves the data unchanged: the md5 of every row of every application table is the same before and
 * after it (opt-in: DATABASE_URL_TEST). Real PostgreSQL, full HTTP stack. Kept from the independent verification of CRO-72.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { URL_BD_TEST } from '../support/baseDatos.js';
import { crearEntornoPostgres, type EntornoPostgres } from '../support/entornoPostgres.js';

describe.skipIf(!URL_BD_TEST)('un comando rechazado no cambia los datos (PostgreSQL real)', () => {
  let e: EntornoPostgres;
  let autor: number;
  let votante: number;
  let admin: number;
  let lugar: number;
  let reporte: number;
  let eliminado: number;

  beforeAll(async () => {
    e = await crearEntornoPostgres();
    autor = await e.usuario();
    votante = await e.usuario();
    admin = await e.usuario({ rol: 'ADMIN' });
    lugar = await e.lugar();
    reporte = (await e.post(autor, '/api/reportes', { lugarId: lugar, nivel: 'MODERADO' })).body.data.reporte.id;
    expect((await e.post(votante, `/api/reportes/${reporte}/validaciones`, { tipoAccion: 'CONFIRMAR' })).status).toBe(201);
    expect((await e.post(votante, `/api/reportes/${reporte}/denuncias`, { motivo: 'SPAM' })).status).toBe(201);
    eliminado = await e.reporteSql(autor, await e.lugar());
    await e.sql(`UPDATE reporte_saturacion SET estado = 'ELIMINADO' WHERE id = $1`, [eliminado]);
  });

  afterAll(async () => {
    await e?.cerrar();
  });

  it('la huella cubre las diez tablas de la aplicacion (todas sus columnas: SELECT *)', async () => {
    expect(await e.tablas()).toEqual([
      'alerta',
      'denuncia',
      'dispositivo_push',
      'lugar',
      'lugar_favorito',
      'reporte_saturacion',
      'sancion_usuario',
      'token_recuperacion',
      'usuario',
      'validacion_reporte',
    ]);
  });

  it.each([
    ['autovoto 422', () => e.post(autor, `/api/reportes/${reporte}/validaciones`, { tipoAccion: 'CONFIRMAR' }), 422, 'AUTOVALIDACION_NO_PERMITIDA'],
    ['voto duplicado 409', () => e.post(votante, `/api/reportes/${reporte}/validaciones`, { tipoAccion: 'RECHAZAR' }), 409, 'VALIDACION_DUPLICADA'],
    ['voto a reporte eliminado 404', () => e.post(votante, `/api/reportes/${eliminado}/validaciones`, { tipoAccion: 'CONFIRMAR' }), 404, 'REPORTE_NO_ENCONTRADO'],
    ['voto con tipo invalido 400', () => e.post(votante, `/api/reportes/${reporte}/validaciones`, { tipoAccion: 'TALVEZ' }), 400, 'VALIDACION_FALLIDA'],
    ['cooldown 422', () => e.post(autor, '/api/reportes', { lugarId: lugar, nivel: 'SATURADO' }), 422, 'REPORTE_EN_ESPERA'],
    ['lugar inexistente 404', () => e.post(autor, '/api/reportes', { lugarId: 999999, nivel: 'SATURADO' }), 404, 'LUGAR_NO_ENCONTRADO'],
    ['denuncia duplicada 409', () => e.post(votante, `/api/reportes/${reporte}/denuncias`, { motivo: 'SPAM' }), 409, 'DENUNCIA_DUPLICADA'],
    ['orden=KARMA 400', () => e.get(admin, '/api/admin/usuarios?orden=KARMA'), 400, 'VALIDACION_FALLIDA'],
  ] as const)('%s', async (_nombre, comando, status, code) => {
    const antes = await e.huella();
    const res = await comando();
    expect([res.status, res.body.code]).toEqual([status, code]);
    expect(await e.huella()).toBe(antes);
  });
});
