/**
 * ContextoReporteDAO composed from the in-memory entity DAOs (`contextoReporteDesde`): the shared contract, plus the
 * "place or author gone" case, which only a composition can reach. In PostgreSQL fk_reporte_lugar and
 * fk_reporte_usuario are ON DELETE RESTRICT, so a report always keeps its place and author there; the composition
 * still omits such a report instead of returning a half context.
 */
import { describe, expect, it, vi } from 'vitest';
import { contextoReporteDesde } from '../../src/dao/ContextoReporteDAO.js';
import { LugarDAOMemoria } from '../support/dao/memoria/LugarDAOMemoria.js';
import { ReporteDAOMemoria } from '../support/dao/memoria/ReporteDAOMemoria.js';
import { UsuarioDAOMemoria } from '../support/dao/memoria/UsuarioDAOMemoria.js';
import { aReporte, aUsuario } from '../support/fabrica/datos.js';
import { contratoContextoReporteDAO } from './ContextoReporteDAO.contract.js';

function armar() {
  const reporteDAO = new ReporteDAOMemoria();
  const lugarDAO = new LugarDAOMemoria();
  const usuarioDAO = new UsuarioDAOMemoria();
  const espias = [vi.spyOn(reporteDAO, 'buscarPorId'), vi.spyOn(lugarDAO, 'buscarPorIds'), vi.spyOn(usuarioDAO, 'buscarPorId')];
  const sembrar = async () => {
    const autor = usuarioDAO.agregar(aUsuario());
    const lugar = lugarDAO.agregar({ direccion: null });
    const reporte = reporteDAO.agregar(aReporte({ usuarioId: autor.id, lugarId: lugar.id, nivelConfiabilidad: null, motivoSinPuntos: null }));
    return { reporteId: reporte.id, lugarId: lugar.id, autorId: autor.id };
  };
  return {
    dao: contextoReporteDesde({ reporteDAO, lugarDAO, usuarioDAO }),
    reporteDAO,
    lugarDAO,
    usuarioDAO,
    sembrar,
    lecturas: () => espias.reduce((suma, espia) => suma + espia.mock.calls.length, 0),
    cerrar: () => espias.forEach((espia) => espia.mockRestore()),
  };
}

contratoContextoReporteDAO('composicion en memoria', async () => armar());

describe('contextoReporteDesde: lugar o autor ausentes', () => {
  it('omite el reporte cuyo lugar ya no existe y conserva los demas', async () => {
    const entorno = armar();
    const sano = await entorno.sembrar();
    const huerfano = await entorno.sembrar();
    vi.spyOn(entorno.lugarDAO, 'buscarPorIds').mockImplementation(async (ids) =>
      (await Promise.all(ids.filter((id) => id !== huerfano.lugarId).map((id) => entorno.lugarDAO.buscarPorId(id)))).filter((l) => l !== null),
    );
    const contextos = await entorno.dao.buscarPorReportes([sano.reporteId, huerfano.reporteId]);
    expect(contextos.map((c) => c.reporte.id)).toEqual([sano.reporteId]);
  });

  it('omite el reporte cuyo autor ya no existe', async () => {
    const entorno = armar();
    const s = await entorno.sembrar();
    vi.spyOn(entorno.usuarioDAO, 'buscarPorId').mockResolvedValue(null);
    expect(await entorno.dao.buscarPorReportes([s.reporteId])).toEqual([]);
  });
});
