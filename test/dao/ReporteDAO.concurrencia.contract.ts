/**
 * Shared concurrency contract of ReporteDAO: the cooldown check and the insert are serialized per
 * (usuario, lugar) inside one transaction (spec M4 R3, S6). PostgreSQL does it with pg_advisory_xact_lock taken in
 * `buscarUltimoDeUsuarioEnLugar`; the in-memory DAO emulates the same mutual exclusion.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import type { ConexionBD } from '../../src/datasource/ConexionBD.js';
import { NivelSaturacion } from '../../src/enum/NivelSaturacion.js';
import type { EntornoReporteDAO } from './ReporteDAO.contract.js';

export interface EntornoConcurrenciaReporteDAO extends EntornoReporteDAO {
  conexion: ConexionBD;
}

const pausa = (ms: number) => new Promise<void>((resolver) => setTimeout(resolver, ms));

export function contratoConcurrenciaReporteDAO(
  nombre: string,
  crearEntorno: () => Promise<EntornoConcurrenciaReporteDAO>,
): void {
  describe(`ReporteDAO concurrency contract: ${nombre}`, () => {
    let entorno: EntornoConcurrenciaReporteDAO;
    let usuarioId: number;
    let lugarId: number;

    beforeEach(async () => {
      entorno = await crearEntorno();
      usuarioId = await entorno.sembrador.usuario();
      lugarId = await entorno.sembrador.lugar();
    });

    /** Cooldown-style critical section: look for a previous report, then insert only when there is none. */
    const intentar = (usuario: number, lugar: number) =>
      entorno.conexion.transaccion(async (tx) => {
        const previo = await entorno.dao.buscarUltimoDeUsuarioEnLugar(usuario, lugar, tx);
        if (previo) return 'BLOQUEADO' as const;
        await pausa(40); // widens the race window: without mutual exclusion both would get here
        await entorno.dao.crear(
          { usuarioId: usuario, lugarId: lugar, nivelSaturacion: NivelSaturacion.MODERADO, fechaHora: new Date() },
          tx,
        );
        return 'CREADO' as const;
      });

    it('dos transacciones simultaneas del mismo par usuario+lugar: una crea y la otra ve su fila', async () => {
      const resultados = await Promise.all([intentar(usuarioId, lugarId), intentar(usuarioId, lugarId)]);
      expect([...resultados].sort()).toEqual(['BLOQUEADO', 'CREADO']);
      expect((await entorno.dao.listarPorUsuario(usuarioId, { page: 1, size: 20 })).total).toBe(1);
    });

    it('pares distintos no se bloquean entre si: ambos crean', async () => {
      const otroLugar = await entorno.sembrador.lugar();
      const resultados = await Promise.all([intentar(usuarioId, lugarId), intentar(usuarioId, otroLugar)]);
      expect(resultados).toEqual(['CREADO', 'CREADO']);
      expect((await entorno.dao.listarPorUsuario(usuarioId, { page: 1, size: 20 })).total).toBe(2);
    });
  });
}
