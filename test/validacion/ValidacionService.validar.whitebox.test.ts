/**
 * Caja blanca de HU 5.2 (Visualizar el nivel de confiabilidad): ValidacionServiceImpl.validar, el método que guarda un
 * voto (HU 5.1) y recalcula la confiabilidad del reporte con la estrategia (HU 5.2) dentro de una transacción.
 *
 * Grafo de flujo (capítulo 10, Figura CB-API-G):
 *   1 buscar reporte con bloqueo · 2 ¿no existe? · 3 ¿está ELIMINADO? · 4 ReporteNoEncontrado
 *   5 ¿es su propio reporte? · 6 Autovalidacion · 7 ¿ya votó? · 8 ValidacionDuplicada
 *   9 ¿el votante no existe? · 10 UsuarioNoEncontrado · 11 guardar voto y calcular confiabilidad
 *   12 ¿hay porcentaje (votos suficientes)? · 13 actualizar la confiabilidad del reporte · 14 puntaje y respuesta · 15 fin
 * Decisiones: 2, 3, 5, 7, 9 y 12, así que V(G) = 6 + 1 = 7 (con N = 15 y E = 20: 20 − 15 + 2 = 7).
 * Cada `it` recorre uno de los siete caminos independientes CB-API-35 a CB-API-41.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { EstadoReporte } from '../../src/enum/EstadoReporte.js';
import { NivelConfiabilidad } from '../../src/enum/NivelConfiabilidad.js';
import { TipoAccionValidacion } from '../../src/enum/TipoAccionValidacion.js';
import { CodigoError } from '../../src/exception/CodigoError.js';
import { ConfiabilidadSimpleStrategy } from '../../src/pattern/strategy/confiabilidad/impl/ConfiabilidadSimpleStrategy.js';
import { ValidacionServiceImpl } from '../../src/service/impl/ValidacionServiceImpl.js';
import { ConexionFalsa } from '../support/ConexionFalsa.js';
import { RelojFijo } from '../support/RelojFijo.js';
import { DenunciaDAOMemoria } from '../support/dao/memoria/DenunciaDAOMemoria.js';
import { LugarDAOMemoria } from '../support/dao/memoria/LugarDAOMemoria.js';
import { ReporteDAOMemoria } from '../support/dao/memoria/ReporteDAOMemoria.js';
import { UsuarioDAOMemoria } from '../support/dao/memoria/UsuarioDAOMemoria.js';
import { ValidacionDAOMemoria } from '../support/dao/memoria/ValidacionDAOMemoria.js';
import { aReporte, aUsuario } from '../support/fabrica/datos.js';
import { puntajeEnMemoria } from '../support/puntajePrueba.js';

const AHORA = new Date('2026-10-05T15:00:00Z');
const C = TipoAccionValidacion.CONFIRMAR;
const R = TipoAccionValidacion.RECHAZAR;

describe('ValidacionServiceImpl.validar (caja blanca, HU 5.2)', () => {
  let usuarioDAO: UsuarioDAOMemoria;
  let reporteDAO: ReporteDAOMemoria;
  let validacionDAO: ValidacionDAOMemoria;
  let servicio: ValidacionServiceImpl;
  let autor: number;
  let votante: number;
  let reporteId: number;

  const usuario = () => usuarioDAO.agregar(aUsuario()).id;
  const votoPrevio = (reporte: number, tipoAccion: TipoAccionValidacion, quien = usuario()) =>
    validacionDAO.crear({ reporteId: reporte, usuarioId: quien, tipoAccion, fechaHora: AHORA });
  const confiabilidadGuardada = async () => (await reporteDAO.buscarPorId(reporteId))?.nivelConfiabilidad ?? null;

  beforeEach(() => {
    usuarioDAO = new UsuarioDAOMemoria();
    validacionDAO = new ValidacionDAOMemoria();
    reporteDAO = new ReporteDAOMemoria({ validaciones: validacionDAO });
    const lugarDAO = new LugarDAOMemoria();
    servicio = new ValidacionServiceImpl({
      reporteDAO,
      lugarDAO,
      validacionDAO,
      denunciaDAO: new DenunciaDAOMemoria(),
      usuarioDAO,
      puntajeService: puntajeEnMemoria(reporteDAO, validacionDAO),
      // The production thresholds: at least 3 votes, ALTA from 70 %, MEDIA from 40 %.
      estrategia: new ConfiabilidadSimpleStrategy({ minVotos: 3, umbralAlta: 70, umbralMedia: 40 }),
      conexion: new ConexionFalsa(),
      reloj: new RelojFijo(AHORA),
      minVotosEstado: 10,
      limiteLugares: 200,
    });
    autor = usuario();
    votante = usuario();
    const lugarId = lugarDAO.agregar({ nombre: 'Parque Kennedy' }).id;
    reporteId = reporteDAO.agregar(aReporte({ usuarioId: autor, lugarId, fechaHora: AHORA })).id;
  });

  it('CB-API-35 · camino 1-2-4-15: el reporte no existe → ReporteNoEncontrado (404)', async () => {
    await expect(servicio.validar(votante, 424242, C)).rejects.toMatchObject({ status: 404, code: CodigoError.REPORTE_NO_ENCONTRADO });
  });

  it('CB-API-36 · camino 1-2-3-4-15: el reporte fue ELIMINADO por moderación → ReporteNoEncontrado (404)', async () => {
    const eliminado = reporteDAO.agregar(aReporte({ usuarioId: autor, estado: EstadoReporte.ELIMINADO })).id;
    await expect(servicio.validar(votante, eliminado, C)).rejects.toMatchObject({ status: 404, code: CodigoError.REPORTE_NO_ENCONTRADO });
    expect(await validacionDAO.listarVotos(eliminado)).toEqual([]);
  });

  it('CB-API-37 · camino 1-2-3-5-6-15: el autor vota su propio reporte → Autovalidacion (422)', async () => {
    await expect(servicio.validar(autor, reporteId, C)).rejects.toMatchObject({ status: 422, code: CodigoError.AUTOVALIDACION_NO_PERMITIDA });
    expect(await validacionDAO.listarVotos(reporteId)).toEqual([]);
  });

  it('CB-API-38 · camino 1-2-3-5-7-8-15: el votante ya votó ese reporte → ValidacionDuplicada (409)', async () => {
    await votoPrevio(reporteId, R, votante);
    await expect(servicio.validar(votante, reporteId, C)).rejects.toMatchObject({ status: 409, code: CodigoError.VALIDACION_DUPLICADA });
    expect(await validacionDAO.listarVotos(reporteId)).toHaveLength(1);
  });

  it('CB-API-39 · camino 1-2-3-5-7-9-10-15: el votante ya no existe (cuenta borrada) → UsuarioNoEncontrado (404)', async () => {
    await expect(servicio.validar(9999, reporteId, C)).rejects.toMatchObject({ status: 404, code: CodigoError.USUARIO_NO_ENCONTRADO });
    expect(await validacionDAO.listarVotos(reporteId)).toEqual([]);
  });

  it('CB-API-40 · camino 1-2-3-5-7-9-11-12-14-15: primer voto (1 de 3 mínimos) → INSUFICIENTE, sin porcentaje y sin actualizar el reporte', async () => {
    const resultado = await servicio.validar(votante, reporteId, C);
    expect(resultado.confiabilidad).toMatchObject({ porcentaje: null, nivel: NivelConfiabilidad.INSUFICIENTE, confirmaciones: 1, rechazos: 0 });
    expect(await confiabilidadGuardada()).toBeNull();
  });

  it('CB-API-41 · camino 1-2-3-5-7-9-11-12-13-14-15: tercer voto (2 confirman y 1 rechaza) → 66,67 % MEDIA y se guarda en el reporte', async () => {
    await votoPrevio(reporteId, C);
    await votoPrevio(reporteId, R);
    const resultado = await servicio.validar(votante, reporteId, C);
    expect(resultado.confiabilidad).toMatchObject({ porcentaje: 66.67, nivel: NivelConfiabilidad.MEDIA, confirmaciones: 2, rechazos: 1 });
    expect(await confiabilidadGuardada()).toBe(66.67);
  });
});
