/**
 * Caja blanca de HU 4.1 (Reportar nivel de saturación): ReporteFacadeImpl.registrar junto con
 * ReporteServiceImpl.validarCooldown, que registrar ejecuta dentro de su transacción.
 *
 * Grafo de flujo (capítulo 10, Figura CB-API-F):
 *   1 buscar lugar · 2 ¿lugar inexistente? · 3 LugarNoEncontrado · 4 buscar último reporte del usuario en el lugar
 *   5 ¿sin reporte previo? · 6 calcular minutos que faltan · 7 ¿ya pasó el cooldown? · 8 ReporteEnEspera
 *   9 crear reporte y recalcular nivel · 10 ¿cambió el nivel? · 11 publicar evento · 12 devolver resultado · 13 fin
 * Decisiones: 2, 5, 7 y 10, así que V(G) = 4 + 1 = 5 (con N = 13 y E = 16: 16 − 13 + 2 = 5).
 * Cada `it` recorre uno de los cinco caminos independientes CB-API-30 a CB-API-34.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import type { SaturacionCambiadaEvento } from '../../src/pattern/observer/SaturacionCambiadaEvento.js';
import type { SaturacionSubject } from '../../src/pattern/observer/SaturacionSubject.js';
import { NivelSaturacion } from '../../src/enum/NivelSaturacion.js';
import { CodigoError } from '../../src/exception/CodigoError.js';
import { ReporteFacadeImpl } from '../../src/facade/impl/ReporteFacadeImpl.js';
import { SaturacionUltimoReporteStrategy } from '../../src/pattern/strategy/saturacion/impl/SaturacionUltimoReporteStrategy.js';
import { ReporteServiceImpl } from '../../src/service/impl/ReporteServiceImpl.js';
import { SaturacionServiceImpl } from '../../src/service/impl/SaturacionServiceImpl.js';
import { ConexionFalsa } from '../support/ConexionFalsa.js';
import { crearLoggerEspia } from '../support/LoggerEspia.js';
import { RelojFijo } from '../support/RelojFijo.js';
import { LugarDAOMemoria } from '../support/dao/memoria/LugarDAOMemoria.js';
import { ReporteDAOMemoria } from '../support/dao/memoria/ReporteDAOMemoria.js';
import { aReporte } from '../support/fabrica/datos.js';
import { puntajeEnMemoria } from '../support/puntajePrueba.js';

const AHORA = new Date('2026-10-05T15:00:00Z');
const COOLDOWN_MIN = 30;
const haceMinutos = (n: number) => new Date(AHORA.getTime() - n * 60_000);
const { MODERADO, SATURADO } = NivelSaturacion;

/** Subject double that keeps every published event (node 11 of the graph). */
class SujetoEspia implements SaturacionSubject {
  eventos: SaturacionCambiadaEvento[] = [];
  suscribir(): void {}
  async notificar(evento: SaturacionCambiadaEvento): Promise<void> {
    this.eventos.push(evento);
  }
}

describe('ReporteFacadeImpl.registrar + validarCooldown (caja blanca, HU 4.1)', () => {
  const USUARIO = 7;
  const OTRO = 8;
  let lugarDAO: LugarDAOMemoria;
  let reporteDAO: ReporteDAOMemoria;
  let sujeto: SujetoEspia;
  let facade: ReporteFacadeImpl;
  let lugarId: number;

  beforeEach(() => {
    const reloj = new RelojFijo(AHORA);
    lugarDAO = new LugarDAOMemoria();
    reporteDAO = new ReporteDAOMemoria();
    sujeto = new SujetoEspia();
    const reporteService = new ReporteServiceImpl({
      reporteDAO,
      lugarDAO,
      reloj,
      cooldownMin: COOLDOWN_MIN,
      puntajeService: puntajeEnMemoria(reporteDAO),
    });
    const saturacionService = new SaturacionServiceImpl({
      lugarDAO,
      reporteDAO,
      // "Latest report" strategy: one report decides the level, so each case controls node 10 with one report.
      estrategia: new SaturacionUltimoReporteStrategy({ ventanaMin: 60 }),
      reloj,
      ventanaMin: 60,
    });
    const { logger } = crearLoggerEspia();
    facade = new ReporteFacadeImpl({ lugarDAO, reporteService, saturacionService, subject: sujeto, conexion: new ConexionFalsa(), logger });
    lugarId = lugarDAO.agregar({ nombre: 'Larcomar' }).id;
  });

  it('CB-API-30 · camino 1-2-3-13: el lugar no existe → LugarNoEncontrado (404) y no se guarda nada', async () => {
    await expect(facade.registrar(USUARIO, 9999, MODERADO)).rejects.toMatchObject({ status: 404, code: CodigoError.LUGAR_NO_ENCONTRADO });
    expect(await reporteDAO.listarPorUsuario(USUARIO, { page: 1, size: 10 })).toMatchObject({ total: 0 });
    expect(sujeto.eventos).toEqual([]);
  });

  it('CB-API-31 · camino 1-2-4-5-9-10-11-12-13: primer reporte del usuario y el nivel cambia → guarda y publica el evento', async () => {
    const resultado = await facade.registrar(USUARIO, lugarId, SATURADO);
    expect(resultado.reporte).toMatchObject({ usuarioId: USUARIO, lugarId, nivelSaturacion: 'SATURADO', estado: 'ACTIVO' });
    expect(resultado.lugar).toMatchObject({ id: lugarId, saturacionActual: 'SATURADO' });
    expect(sujeto.eventos).toEqual([
      expect.objectContaining({ lugarId, nivelAnterior: null, nivelNuevo: 'SATURADO', autorId: USUARIO }),
    ]);
  });

  it('CB-API-32 · camino 1-2-4-5-9-10-12-13: primer reporte del usuario y el nivel no cambia → guarda sin publicar', async () => {
    await facade.registrar(OTRO, lugarId, MODERADO);
    sujeto.eventos = [];
    const resultado = await facade.registrar(USUARIO, lugarId, MODERADO);
    expect(resultado.reporte).toMatchObject({ usuarioId: USUARIO, nivelSaturacion: 'MODERADO' });
    expect(resultado.lugar.saturacionActual).toBe('MODERADO');
    expect(sujeto.eventos).toEqual([]);
  });

  it('CB-API-33 · camino 1-2-4-5-6-7-8-13: reporte previo hace 10 min (cooldown de 30) → ReporteEnEspera con 20 minutos', async () => {
    reporteDAO.agregar(aReporte({ usuarioId: USUARIO, lugarId, nivelSaturacion: MODERADO, fechaHora: haceMinutos(10) }));
    await expect(facade.registrar(USUARIO, lugarId, SATURADO)).rejects.toMatchObject({
      code: CodigoError.REPORTE_EN_ESPERA,
      minutosRestantes: 20,
      message: 'Ya reportaste este lugar. Vuelve a intentarlo en 20 minutos.',
    });
    expect((await reporteDAO.listarPorUsuario(USUARIO, { page: 1, size: 10 })).total).toBe(1);
    expect(sujeto.eventos).toEqual([]);
  });

  it('CB-API-34 · camino 1-2-4-5-6-7-9-10-11-12-13: reporte previo hace exactamente 30 min (límite) → el cooldown ya pasó y registra', async () => {
    reporteDAO.agregar(aReporte({ usuarioId: USUARIO, lugarId, nivelSaturacion: MODERADO, fechaHora: haceMinutos(COOLDOWN_MIN) }));
    const resultado = await facade.registrar(USUARIO, lugarId, SATURADO);
    expect(resultado.reporte).toMatchObject({ nivelSaturacion: 'SATURADO' });
    expect((await reporteDAO.listarPorUsuario(USUARIO, { page: 1, size: 10 })).total).toBe(2);
    expect(sujeto.eventos).toEqual([expect.objectContaining({ nivelNuevo: 'SATURADO' })]);
  });
});
