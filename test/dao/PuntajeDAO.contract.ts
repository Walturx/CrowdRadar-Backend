/**
 * Shared contract for PuntajeDAO (CRO-72): what a user's points are made of, read in one go. Run against the in-memory
 * DAO (which applies the TypeScript rule `estadoValidacionPorConteo`) and against PuntajeDAOSequelize (the SQL), so a
 * pass on both proves that the query and the TS rule agree on every case below.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { PuntajeDAO } from '../../src/dao/PuntajeDAO.js';
import type { ReglaEstadoValidacion } from '../../src/pattern/strategy/confiabilidad/derivarEstadoValidacion.js';
import { TipoAccionValidacion } from '../../src/enum/TipoAccionValidacion.js';

export interface EntornoPuntajeDAO {
  dao: PuntajeDAO;
  /** A new user; returns its id. */
  usuario(): Promise<number>;
  /** A new ACTIVO report of the author; returns its id. */
  reporte(autorId: number): Promise<number>;
  votar(usuarioId: number, reporteId: number, tipoAccion: TipoAccionValidacion): Promise<void>;
  /** Marks the report ELIMINADO (what moderation does). */
  eliminar(reporteId: number): Promise<void>;
  /** Reads sent to the store since the environment was built (SQL statements; 0 in memory). */
  lecturas(): number;
  cerrar(): void;
}

/** The configured defaults: CONFIABILIDAD_MIN_VOTOS 3, UMBRAL_ALTA 70, UMBRAL_MEDIA 40, MIN_VOTOS_ESTADO 10. */
export const REGLA: ReglaEstadoValidacion = { minVotos: 3, umbralAlta: 70, umbralMedia: 40, minVotosEstado: 10 };

const C = TipoAccionValidacion.CONFIRMAR;
const R = TipoAccionValidacion.RECHAZAR;
const ID_INEXISTENTE = 2_000_000_000;

export function contratoPuntajeDAO(nombre: string, crearEntorno: () => Promise<EntornoPuntajeDAO>): void {
  describe(`PuntajeDAO contract: ${nombre}`, () => {
    let e: EntornoPuntajeDAO;
    beforeEach(async () => {
      e = await crearEntorno();
    });
    afterEach(() => e.cerrar());

    /** A report of `autor` voted by fresh users: `confirman` CONFIRMAR and `rechazan` RECHAZAR. Returns the voters. */
    async function reporteVotado(autor: number, confirman: number, rechazan: number) {
      const reporteId = await e.reporte(autor);
      const confirmadores: number[] = [];
      const rechazadores: number[] = [];
      for (let i = 0; i < confirman; i += 1) confirmadores.push(await e.usuario());
      for (let i = 0; i < rechazan; i += 1) rechazadores.push(await e.usuario());
      for (const u of confirmadores) await e.votar(u, reporteId, C);
      for (const u of rechazadores) await e.votar(u, reporteId, R);
      return { reporteId, confirmadores, rechazadores };
    }

    const aportes = async (usuarioId: number, regla = REGLA) => (await e.dao.contarAportes([usuarioId], regla)).get(usuarioId);

    it('sin ids no lee nada y devuelve vacio', async () => {
      const antes = e.lecturas();
      expect((await e.dao.contarAportes([], REGLA)).size).toBe(0);
      expect(await e.dao.listarValidados([], REGLA)).toEqual([]);
      expect(e.lecturas()).toBe(antes);
    });

    it('un usuario sin reportes ni votos (o inexistente) tiene ceros', async () => {
      const nuevo = await e.usuario();
      const mapa = await e.dao.contarAportes([nuevo, ID_INEXISTENTE], REGLA);
      expect(mapa.get(nuevo)).toEqual({ reportesValidados: 0, votosAcertados: 0 });
      expect(mapa.get(ID_INEXISTENTE)).toEqual({ reportesValidados: 0, votosAcertados: 0 });
    });

    it('VALIDADO con 10 votos al 70 %: +1 reporte al autor, +1 voto acertado a quien confirmo y nada a quien rechazo', async () => {
      const autor = await e.usuario();
      const { reporteId, confirmadores, rechazadores } = await reporteVotado(autor, 7, 3);
      expect(await aportes(autor)).toEqual({ reportesValidados: 1, votosAcertados: 0 });
      expect(await aportes(confirmadores[0]!)).toEqual({ reportesValidados: 0, votosAcertados: 1 });
      expect(await aportes(rechazadores[0]!)).toEqual({ reportesValidados: 0, votosAcertados: 0 });
      expect(await e.dao.listarValidados([reporteId], REGLA)).toEqual([reporteId]);
    });

    it('RECHAZADO con 10 votos al 30 %: nada al autor, +1 a quien rechazo y nada a quien confirmo', async () => {
      const autor = await e.usuario();
      const { reporteId, confirmadores, rechazadores } = await reporteVotado(autor, 3, 7);
      expect(await aportes(autor)).toEqual({ reportesValidados: 0, votosAcertados: 0 });
      expect(await aportes(rechazadores[0]!)).toEqual({ reportesValidados: 0, votosAcertados: 1 });
      expect(await aportes(confirmadores[0]!)).toEqual({ reportesValidados: 0, votosAcertados: 0 });
      expect(await e.dao.listarValidados([reporteId], REGLA)).toEqual([]);
    });

    it('EN_VALIDACION no da puntos a nadie: 9 votos todos confirmando (pocos votos)', async () => {
      const autor = await e.usuario();
      const { reporteId, confirmadores } = await reporteVotado(autor, 9, 0);
      expect(await aportes(autor)).toEqual({ reportesValidados: 0, votosAcertados: 0 });
      expect(await aportes(confirmadores[0]!)).toEqual({ reportesValidados: 0, votosAcertados: 0 });
      expect(await e.dao.listarValidados([reporteId], REGLA)).toEqual([]);
    });

    it('EN_VALIDACION no da puntos a nadie: 10 votos al 40 % (MEDIA)', async () => {
      const autor = await e.usuario();
      const { confirmadores, rechazadores } = await reporteVotado(autor, 4, 6);
      expect(await aportes(autor)).toEqual({ reportesValidados: 0, votosAcertados: 0 });
      expect(await aportes(confirmadores[0]!)).toEqual({ reportesValidados: 0, votosAcertados: 0 });
      expect(await aportes(rechazadores[0]!)).toEqual({ reportesValidados: 0, votosAcertados: 0 });
    });

    it('el borde del 70 %: 7 de 10 es VALIDADO, 13 de 19 (68.42 %) no', async () => {
      const autor = await e.usuario();
      await reporteVotado(autor, 7, 3);
      await reporteVotado(autor, 13, 6);
      expect(await aportes(autor)).toEqual({ reportesValidados: 1, votosAcertados: 0 });
    });

    it('el borde del 40 %: 4 de 10 sigue EN_VALIDACION y 7 de 18 (38.89 %) es RECHAZADO', async () => {
      const autor = await e.usuario();
      const medio = await reporteVotado(autor, 4, 6);
      const bajo = await reporteVotado(autor, 7, 11);
      expect(await aportes(medio.rechazadores[0]!)).toEqual({ reportesValidados: 0, votosAcertados: 0 });
      expect(await aportes(bajo.rechazadores[0]!)).toEqual({ reportesValidados: 0, votosAcertados: 1 });
    });

    it('un reporte ELIMINADO no da puntos ni a su autor ni a sus votantes, aunque sus votos lo validen', async () => {
      const autor = await e.usuario();
      const { reporteId, confirmadores } = await reporteVotado(autor, 10, 0);
      expect(await aportes(autor)).toEqual({ reportesValidados: 1, votosAcertados: 0 });
      await e.eliminar(reporteId);
      expect(await aportes(autor)).toEqual({ reportesValidados: 0, votosAcertados: 0 });
      expect(await aportes(confirmadores[0]!)).toEqual({ reportesValidados: 0, votosAcertados: 0 });
      expect(await e.dao.listarValidados([reporteId], REGLA)).toEqual([]);
    });

    it('si un reporte deja de estar VALIDADO (llegan rechazos) su autor pierde ese reporte', async () => {
      const autor = await e.usuario();
      const { reporteId } = await reporteVotado(autor, 7, 3);
      expect(await aportes(autor)).toEqual({ reportesValidados: 1, votosAcertados: 0 });
      await e.votar(await e.usuario(), reporteId, R); // 7 of 11 = 63.64 %
      expect(await aportes(autor)).toEqual({ reportesValidados: 0, votosAcertados: 0 });
    });

    it('suma los reportes y los votos de un mismo usuario', async () => {
      const ana = await e.usuario();
      await reporteVotado(ana, 10, 0);
      await reporteVotado(ana, 10, 0);
      const ajeno = await reporteVotado(await e.usuario(), 9, 0);
      await e.votar(ana, ajeno.reporteId, C); // the tenth vote validates it, and Ana's vote matches
      const rechazado = await reporteVotado(await e.usuario(), 0, 9);
      await e.votar(ana, rechazado.reporteId, R);
      expect(await aportes(ana)).toEqual({ reportesValidados: 2, votosAcertados: 2 });
    });

    it('varios usuarios en una sola lectura, cada uno con lo suyo y los repetidos una vez', async () => {
      const a = await e.usuario();
      const b = await e.usuario();
      await reporteVotado(a, 10, 0);
      const antes = e.lecturas();
      const mapa = await e.dao.contarAportes([a, b, a], REGLA);
      expect(e.lecturas() - antes).toBeLessThanOrEqual(1);
      expect([...mapa.keys()].sort((x, y) => x - y)).toEqual([a, b].sort((x, y) => x - y));
      expect(mapa.get(a)).toEqual({ reportesValidados: 1, votosAcertados: 0 });
      expect(mapa.get(b)).toEqual({ reportesValidados: 0, votosAcertados: 0 });
    });

    it('listarValidados devuelve solo los VALIDADOS de la lista, una vez cada uno', async () => {
      const autor = await e.usuario();
      const validado = await reporteVotado(autor, 10, 0);
      const pendiente = await reporteVotado(autor, 2, 0);
      const ajeno = await reporteVotado(await e.usuario(), 10, 0);
      const ids = await e.dao.listarValidados([validado.reporteId, pendiente.reporteId, validado.reporteId, ID_INEXISTENTE], REGLA);
      expect(ids).toEqual([validado.reporteId]);
      expect(ids).not.toContain(ajeno.reporteId);
    });

    it('usa la regla recibida: con minimo 4 votos y umbral 60, 3 de 4 ya valida y 1 de 4 ya rechaza', async () => {
      const regla: ReglaEstadoValidacion = { minVotos: 3, umbralAlta: 60, umbralMedia: 40, minVotosEstado: 4 };
      const autor = await e.usuario();
      const validado = await reporteVotado(autor, 3, 1);
      const rechazado = await reporteVotado(autor, 1, 3);
      expect(await aportes(autor, regla)).toEqual({ reportesValidados: 1, votosAcertados: 0 });
      expect(await aportes(rechazado.rechazadores[0]!, regla)).toEqual({ reportesValidados: 0, votosAcertados: 1 });
      expect(await e.dao.listarValidados([validado.reporteId, rechazado.reporteId], regla)).toEqual([validado.reporteId]);
      // with the defaults neither has enough votes
      expect(await aportes(autor)).toEqual({ reportesValidados: 0, votosAcertados: 0 });
    });

    it('respeta CONFIABILIDAD_MIN_VOTOS aunque MIN_VOTOS_ESTADO sea menor: 2 votos con minimo 3 no validan', async () => {
      const regla: ReglaEstadoValidacion = { minVotos: 3, umbralAlta: 70, umbralMedia: 40, minVotosEstado: 1 };
      const autor = await e.usuario();
      await reporteVotado(autor, 2, 0);
      expect(await aportes(autor, regla)).toEqual({ reportesValidados: 0, votosAcertados: 0 });
      await reporteVotado(autor, 3, 0);
      expect(await aportes(autor, regla)).toEqual({ reportesValidados: 1, votosAcertados: 0 });
    });
  });
}
