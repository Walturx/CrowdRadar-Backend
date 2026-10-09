/** Shared contract for ValidacionDAO (M5). Design 4.5: unique (reporte, usuario); votes carry the voter's karma. */
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

    const votar = async (tipoAccion: TipoAccionValidacion, karmaVotante: number, fecha = T0) =>
      entorno.dao.crear({
        reporteId,
        usuarioId: await entorno.sembrador.usuario(),
        tipoAccion,
        karmaVotante,
        puntosOtorgados: 2,
        fechaHora: fecha,
      });

    it('crea el voto con karma del votante y lo encuentra por usuario y reporte', async () => {
      const voto = await votar(TipoAccionValidacion.CONFIRMAR, 120);
      expect(voto).toMatchObject({ reporteId, tipoAccion: 'CONFIRMAR', karmaVotante: 120, puntosOtorgados: 2 });
      expect((await entorno.dao.buscarPorUsuarioYReporte(voto.usuarioId, reporteId))?.id).toBe(voto.id);
      expect(await entorno.dao.buscarPorUsuarioYReporte(voto.usuarioId + 1, reporteId)).toBeNull();
    });

    it('rechaza un segundo voto del mismo usuario con ConflictoException', async () => {
      const voto = await votar(TipoAccionValidacion.CONFIRMAR, 10);
      await expect(
        entorno.dao.crear({ ...voto, tipoAccion: TipoAccionValidacion.RECHAZAR }),
      ).rejects.toBeInstanceOf(ConflictoException);
      expect(await entorno.dao.listarVotos(reporteId)).toHaveLength(1);
    });

    it('listarVotos devuelve solo los del reporte, el mas antiguo primero', async () => {
      const segundo = await votar(TipoAccionValidacion.RECHAZAR, 5, new Date(T0.getTime() + 60_000));
      const primero = await votar(TipoAccionValidacion.CONFIRMAR, 50, T0);
      const otroReporte = await entorno.sembrador.reporte(1, 1);
      await entorno.dao.crear({
        reporteId: otroReporte,
        usuarioId: primero.usuarioId,
        tipoAccion: TipoAccionValidacion.CONFIRMAR,
        karmaVotante: 1,
        puntosOtorgados: 0,
        fechaHora: T0,
      });
      expect((await entorno.dao.listarVotos(reporteId)).map((v) => v.id)).toEqual([primero.id, segundo.id]);
    });
    it('listarVotosDeReportes junta los votos de varios reportes y omite los de los demas', async () => {
      const autor = await entorno.sembrador.usuario();
      const lugar = await entorno.sembrador.lugar();
      const otroReporte = await entorno.sembrador.reporte(autor, lugar);
      const ajeno = await entorno.sembrador.reporte(autor, lugar);
      const enReporte = await votar(TipoAccionValidacion.CONFIRMAR, 10);
      const enOtro = await entorno.dao.crear({
        reporteId: otroReporte,
        usuarioId: enReporte.usuarioId,
        tipoAccion: TipoAccionValidacion.RECHAZAR,
        karmaVotante: 10,
        puntosOtorgados: 2,
        fechaHora: T0,
      });
      await entorno.dao.crear({ ...enOtro, reporteId: ajeno });
      const votos = await entorno.dao.listarVotosDeReportes([reporteId, otroReporte]);
      expect(votos.map((v) => v.id)).toEqual([enReporte.id, enOtro.id]);
      expect(await entorno.dao.listarVotosDeReportes([])).toEqual([]);
    });
    it('listarReporteIdsVotadosPor devuelve los reportes en que el usuario voto y ninguno mas', async () => {
      const autor = await entorno.sembrador.usuario();
      const lugar = await entorno.sembrador.lugar();
      const otroReporte = await entorno.sembrador.reporte(autor, lugar);
      await entorno.sembrador.reporte(autor, lugar); // never voted
      const voto = await votar(TipoAccionValidacion.CONFIRMAR, 10);
      await entorno.dao.crear({ ...voto, reporteId: otroReporte });
      expect(await entorno.dao.listarReporteIdsVotadosPor(voto.usuarioId)).toEqual([reporteId, otroReporte]);
      expect(await entorno.dao.listarReporteIdsVotadosPor(autor)).toEqual([]);
    });
  });
}
