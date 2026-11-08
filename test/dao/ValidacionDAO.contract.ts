/** Shared contract for ValidacionDAO (M5). Design 4.5: unique (reporte, usuario); a vote is its type and instant (CRO-72). */
import { beforeEach, describe, expect, it } from 'vitest';
import type { ValidacionDAO } from '../../src/dao/ValidacionDAO.js';
import { TipoAccionValidacion } from '../../src/enum/TipoAccionValidacion.js';
import { ConflictoException } from '../../src/exception/http/ConflictoException.js';
import type { Sembrador } from './Sembrador.js';

export interface EntornoValidacionDAO {
  dao: ValidacionDAO;
  sembrador: Sembrador;
}

const T0 = new Date('2026-10-05T14:00:00Z');

export function contratoValidacionDAO(nombre: string, crearEntorno: () => Promise<EntornoValidacionDAO>): void {
  describe(`ValidacionDAO contract: ${nombre}`, () => {
    let entorno: EntornoValidacionDAO;
    let reporteId: number;
    beforeEach(async () => {
      entorno = await crearEntorno();
      reporteId = await entorno.sembrador.reporte(await entorno.sembrador.usuario(), await entorno.sembrador.lugar());
    });

    const votar = async (tipoAccion: TipoAccionValidacion, fecha = T0) =>
      entorno.dao.crear({
        reporteId,
        usuarioId: await entorno.sembrador.usuario(),
        tipoAccion,
        fechaHora: fecha,
      });

    it('crea el voto y lo encuentra por usuario y reporte', async () => {
      const voto = await votar(TipoAccionValidacion.CONFIRMAR);
      expect(voto).toEqual({
        id: expect.any(Number),
        reporteId,
        usuarioId: voto.usuarioId,
        tipoAccion: 'CONFIRMAR',
        fechaHora: T0,
        createdAt: expect.any(Date),
        updatedAt: expect.any(Date),
      });
      expect((await entorno.dao.buscarPorUsuarioYReporte(voto.usuarioId, reporteId))?.id).toBe(voto.id);
      expect(await entorno.dao.buscarPorUsuarioYReporte(voto.usuarioId + 1, reporteId)).toBeNull();
    });

    it('rechaza un segundo voto del mismo usuario con ConflictoException', async () => {
      const voto = await votar(TipoAccionValidacion.CONFIRMAR);
      await expect(
        entorno.dao.crear({ ...voto, tipoAccion: TipoAccionValidacion.RECHAZAR }),
      ).rejects.toBeInstanceOf(ConflictoException);
      expect(await entorno.dao.listarVotos(reporteId)).toHaveLength(1);
    });

    it('listarVotos devuelve solo los del reporte, el mas antiguo primero', async () => {
      const segundo = await votar(TipoAccionValidacion.RECHAZAR, new Date(T0.getTime() + 60_000));
      const primero = await votar(TipoAccionValidacion.CONFIRMAR, T0);
      const otroReporte = await entorno.sembrador.reporte(1, 1);
      await entorno.dao.crear({
        reporteId: otroReporte,
        usuarioId: primero.usuarioId,
        tipoAccion: TipoAccionValidacion.CONFIRMAR,
        fechaHora: T0,
      });
      expect((await entorno.dao.listarVotos(reporteId)).map((v) => v.id)).toEqual([primero.id, segundo.id]);
    });
    it('listarVotosDeReportes junta los votos de varios reportes y omite los de los demas', async () => {
      const autor = await entorno.sembrador.usuario();
      const lugar = await entorno.sembrador.lugar();
      const otroReporte = await entorno.sembrador.reporte(autor, lugar);
      const ajeno = await entorno.sembrador.reporte(autor, lugar);
      const enReporte = await votar(TipoAccionValidacion.CONFIRMAR);
      const enOtro = await entorno.dao.crear({
        reporteId: otroReporte,
        usuarioId: enReporte.usuarioId,
        tipoAccion: TipoAccionValidacion.RECHAZAR,
        fechaHora: T0,
      });
      await entorno.dao.crear({ ...enOtro, reporteId: ajeno });
      const votos = await entorno.dao.listarVotosDeReportes([reporteId, otroReporte]);
      expect(votos.map((v) => v.id)).toEqual([enReporte.id, enOtro.id]);
      expect(await entorno.dao.listarVotosDeReportes([])).toEqual([]);
    });
  });
}
