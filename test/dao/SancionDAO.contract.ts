/** Shared contract for SancionDAO (M6). Design 3, 4.7: the active sanction is the source of truth. */
import { beforeEach, describe, expect, it } from 'vitest';
import { ForeignKeyConstraintError } from 'sequelize';
import type { SancionDAO } from '../../src/dao/SancionDAO.js';
import type { DiasSuspension } from '../../src/entity/SancionUsuario.js';
import { ID_INEXISTENTE, type Sembrador } from './Sembrador.js';

export interface EntornoSancionDAO {
  dao: SancionDAO;
  sembrador: Sembrador;
}

const INICIO = new Date('2026-10-05T14:00:00Z');
const dias = (n: number) => new Date(INICIO.getTime() + n * 86_400_000);

export function contratoSancionDAO(nombre: string, crearEntorno: () => Promise<EntornoSancionDAO>): void {
  describe(`SancionDAO contract: ${nombre}`, () => {
    let dao: SancionDAO;
    let usuarioId: number;
    let adminId: number;
    beforeEach(async () => {
      const entorno = await crearEntorno();
      dao = entorno.dao;
      usuarioId = await entorno.sembrador.usuario();
      adminId = await entorno.sembrador.usuario();
    });

    const sancionar = (cantidadDias: DiasSuspension, extra: { usuarioId?: number } = {}) =>
      dao.crear({
        usuarioId: extra.usuarioId ?? usuarioId,
        administradorId: adminId,
        dias: cantidadDias,
        motivo: 'Reportes falsos reiterados',
        fechaInicio: INICIO,
        fechaFin: dias(cantidadDias),
      });

    it('crea una sancion SUSPENSION_TEMPORAL sin levantar', async () => {
      const sancion = await sancionar(7);
      expect(sancion).toMatchObject({ usuarioId, administradorId: adminId, tipo: 'SUSPENSION_TEMPORAL', dias: 7 });
      expect(sancion).toMatchObject({ fechaLevantamiento: null, levantadaPor: null });
      expect(sancion.fechaFin).toEqual(dias(7));
    });

    it('buscarVigente: vigente antes de fechaFin, null desde fechaFin, null para otro usuario', async () => {
      await sancionar(3);
      expect((await dao.buscarVigente(usuarioId, dias(2)))?.dias).toBe(3);
      expect(await dao.buscarVigente(usuarioId, dias(3))).toBeNull();
      expect(await dao.buscarVigente(usuarioId + 99, dias(1))).toBeNull();
    });

    it('buscarVigente devuelve la mas reciente cuando hay varias sin levantar', async () => {
      await sancionar(3);
      const larga = await sancionar(30);
      expect((await dao.buscarVigente(usuarioId, dias(1)))?.id).toBe(larga.id);
    });

    it('levantar registra fecha y administrador, y la sancion deja de estar vigente', async () => {
      const sancion = await sancionar(30);
      const levantada = await dao.levantar(sancion.id, adminId, dias(1));
      expect(levantada).toMatchObject({ fechaLevantamiento: dias(1), levantadaPor: adminId });
      expect(await dao.buscarVigente(usuarioId, dias(2))).toBeNull();
      expect(await dao.levantar(sancion.id + 1000, adminId, dias(1))).toBeNull();
    });

    it('crear para un usuario inexistente lanza ForeignKeyConstraintError', async () => {
      await expect(sancionar(3, { usuarioId: ID_INEXISTENTE })).rejects.toBeInstanceOf(ForeignKeyConstraintError);
    });
  });
}
