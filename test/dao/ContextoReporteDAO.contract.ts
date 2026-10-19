/**
 * Shared contract for ContextoReporteDAO (M6 review queue): report, place and author of many reports in one read.
 * Run against the composition of the in-memory entity DAOs and against ContextoReporteDAOSequelize on PostgreSQL.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ContextoReporteDAO } from '../../src/dao/ContextoReporteDAO.js';
import type { ReporteDAO } from '../../src/dao/ReporteDAO.js';
import { EstadoReporte } from '../../src/enum/EstadoReporte.js';

export interface ReporteSembrado {
  reporteId: number;
  lugarId: number;
  autorId: number;
}

export interface EntornoContextoReporteDAO {
  dao: ContextoReporteDAO;
  /** Seeds an author, a place without `direccion` and an ACTIVO report of that author at that place. */
  sembrar(): Promise<ReporteSembrado>;
  reporteDAO: Pick<ReporteDAO, 'actualizarEstado' | 'actualizarConfiabilidad'>;
  /** Reads sent to the store since the environment was built (SQL statements, or entity DAO calls in memory). */
  lecturas(): number;
  /** Undoes what the environment hooked into shared state (e.g. a Sequelize query hook). */
  cerrar(): void;
}

const ID_INEXISTENTE = 2_000_000_000;

export function contratoContextoReporteDAO(nombre: string, crearEntorno: () => Promise<EntornoContextoReporteDAO>): void {
  describe(`ContextoReporteDAO contract: ${nombre}`, () => {
    let entorno: EntornoContextoReporteDAO;
    beforeEach(async () => {
      entorno = await crearEntorno();
    });
    afterEach(() => entorno.cerrar());

    it('sin ids devuelve [] sin leer nada', async () => {
      const antes = entorno.lecturas();
      expect(await entorno.dao.buscarPorReportes([])).toEqual([]);
      expect(entorno.lecturas()).toBe(antes);
    });

    it('trae reporte, lugar y autor de cada id; los repetidos salen una vez y los inexistentes se omiten', async () => {
      const a = await entorno.sembrar();
      const b = await entorno.sembrar();
      const contextos = await entorno.dao.buscarPorReportes([a.reporteId, b.reporteId, a.reporteId, ID_INEXISTENTE]);
      const porId = new Map(contextos.map((c) => [c.reporte.id, c]));
      expect(contextos).toHaveLength(2);
      for (const s of [a, b]) {
        const contexto = porId.get(s.reporteId)!;
        expect(contexto.reporte).toMatchObject({ id: s.reporteId, usuarioId: s.autorId, lugarId: s.lugarId, estado: EstadoReporte.ACTIVO });
        expect(contexto.lugar.id).toBe(s.lugarId);
        expect(contexto.autor.id).toBe(s.autorId);
      }
    });

    it('devuelve reportes de cualquier estado (el llamador decide que hacer con un ELIMINADO)', async () => {
      const s = await entorno.sembrar();
      await entorno.reporteDAO.actualizarEstado(s.reporteId, EstadoReporte.ELIMINADO);
      const [contexto] = await entorno.dao.buscarPorReportes([s.reporteId]);
      expect(contexto?.reporte.estado).toBe(EstadoReporte.ELIMINADO);
    });

    it('nivelConfiabilidad DECIMAL llega como number y los opcionales nulos como null', async () => {
      const s = await entorno.sembrar();
      await entorno.reporteDAO.actualizarConfiabilidad(s.reporteId, 66.67);
      const [contexto] = await entorno.dao.buscarPorReportes([s.reporteId]);
      expect(contexto?.reporte.nivelConfiabilidad).toBe(66.67);
      expect(contexto?.reporte.motivoSinPuntos).toBeNull();
      expect(contexto?.lugar.direccion).toBeNull();
      expect(Object.keys(contexto!.autor).sort()).toEqual(['apellido', 'email', 'id', 'nombre']);
    });
  });
}
