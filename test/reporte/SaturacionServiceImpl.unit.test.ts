/** Unit tests of SaturacionServiceImpl: recompute and store the level of a place (spec M4 R5). */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ContextoTx } from '../../src/datasource/ConexionBD.js';
import { NivelSaturacion } from '../../src/enum/NivelSaturacion.js';
import { CodigoError } from '../../src/exception/CodigoError.js';
import { RecursoNoEncontradoException } from '../../src/exception/http/RecursoNoEncontradoException.js';
import type { EstrategiaSaturacion } from '../../src/pattern/strategy/saturacion/EstrategiaSaturacion.js';
import { SaturacionServiceImpl } from '../../src/service/impl/SaturacionServiceImpl.js';
import { RelojFijo } from '../support/RelojFijo.js';
import { LugarDAOMemoria } from '../support/dao/memoria/LugarDAOMemoria.js';
import { ReporteDAOMemoria } from '../support/dao/memoria/ReporteDAOMemoria.js';

const AHORA = new Date('2026-10-05T15:00:00Z');
const TX = {} as ContextoTx;

/** Strategy double: records what the service handed it and answers a fixed level. */
class EstrategiaEspia implements EstrategiaSaturacion {
  recibidos: { ids: number[]; ahora: Date }[] = [];
  constructor(private readonly respuesta: NivelSaturacion | null) {}
  calcular(reportes: readonly { id: number }[], ahora: Date): NivelSaturacion | null {
    this.recibidos.push({ ids: reportes.map((r) => r.id), ahora });
    return this.respuesta;
  }
}

describe('SaturacionServiceImpl.recalcular', () => {
  let lugarDAO: LugarDAOMemoria;
  let reporteDAO: ReporteDAOMemoria;
  let lugarId: number;

  const servicio = (estrategia: EstrategiaSaturacion) =>
    new SaturacionServiceImpl({ lugarDAO, reporteDAO, estrategia, reloj: new RelojFijo(AHORA), ventanaMin: 60 });

  beforeEach(() => {
    lugarDAO = new LugarDAOMemoria();
    reporteDAO = new ReporteDAOMemoria();
    lugarId = lugarDAO.agregar({ saturacionActual: NivelSaturacion.TRANQUILO }).id;
  });

  it('escribe el nivel nuevo con la hora actual y devuelve anterior, nuevo y actualizadoEn', async () => {
    const cambio = await servicio(new EstrategiaEspia(NivelSaturacion.SATURADO)).recalcular(lugarId, TX);
    expect(cambio).toEqual({
      lugarId,
      anterior: NivelSaturacion.TRANQUILO,
      nuevo: NivelSaturacion.SATURADO,
      actualizadoEn: AHORA,
    });
    const guardado = await lugarDAO.buscarPorId(lugarId);
    expect(guardado).toMatchObject({ saturacionActual: 'SATURADO', saturacionActualizadaEn: AHORA });
  });

  it('un resultado null tambien se escribe (el lugar vuelve a SIN_INFORMACION)', async () => {
    const cambio = await servicio(new EstrategiaEspia(null)).recalcular(lugarId, TX);
    expect(cambio).toMatchObject({ anterior: 'TRANQUILO', nuevo: null });
    expect(await lugarDAO.buscarPorId(lugarId)).toMatchObject({
      saturacionActual: null,
      saturacionActualizadaEn: AHORA,
    });
  });

  it('entrega a la estrategia solo los reportes de la ventana (60 min) del lugar, y la hora actual', async () => {
    const otroLugar = lugarDAO.agregar().id;
    const dentro = await reporteDAO.crear({ usuarioId: 1, lugarId, nivelSaturacion: 'MODERADO', fechaHora: new Date(AHORA.getTime() - 59 * 60_000) });
    await reporteDAO.crear({ usuarioId: 1, lugarId, nivelSaturacion: 'MODERADO', fechaHora: new Date(AHORA.getTime() - 61 * 60_000) });
    await reporteDAO.crear({ usuarioId: 1, lugarId: otroLugar, nivelSaturacion: 'MODERADO', fechaHora: AHORA });
    const estrategia = new EstrategiaEspia(NivelSaturacion.MODERADO);
    await servicio(estrategia).recalcular(lugarId, TX);
    expect(estrategia.recibidos).toEqual([{ ids: [dentro.id], ahora: AHORA }]);
  });

  it('con el lugar que el llamador ya bloqueo toma de ahi el nivel anterior y no lo vuelve a leer', async () => {
    const bloqueado = (await lugarDAO.buscarPorId(lugarId))!;
    const buscar = vi.spyOn(lugarDAO, 'buscarPorId');
    const cambio = await servicio(new EstrategiaEspia(NivelSaturacion.SATURADO)).recalcular(lugarId, TX, bloqueado);
    expect(buscar).not.toHaveBeenCalled();
    expect(cambio).toMatchObject({ lugarId, anterior: NivelSaturacion.TRANQUILO, nuevo: NivelSaturacion.SATURADO });
  });

  it('un lugar sin nivel previo devuelve anterior null', async () => {
    const nuevoLugar = lugarDAO.agregar().id;
    const cambio = await servicio(new EstrategiaEspia(NivelSaturacion.MODERADO)).recalcular(nuevoLugar, TX);
    expect(cambio).toMatchObject({ anterior: null, nuevo: 'MODERADO' });
  });

  it('un lugar inexistente lanza 404 LUGAR_NO_ENCONTRADO', async () => {
    const error = await servicio(new EstrategiaEspia(null)).recalcular(424242, TX).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(RecursoNoEncontradoException);
    expect(error).toMatchObject({ status: 404, code: CodigoError.LUGAR_NO_ENCONTRADO });
  });
});
