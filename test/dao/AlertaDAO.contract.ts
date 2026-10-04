/** Shared contract for AlertaDAO (M3). Spec M3 R5, R6: caller-scoped list, unread count, idempotent mark-as-read. */
import { beforeEach, describe, expect, it } from 'vitest';
import { ForeignKeyConstraintError } from 'sequelize';
import type { AlertaDAO } from '../../src/dao/AlertaDAO.js';
import { casosPaginacion } from './paginacion.contract.js';
import { ID_INEXISTENTE, type Sembrador } from './Sembrador.js';

export interface EntornoAlertaDAO {
  dao: AlertaDAO;
  sembrador: Sembrador;
}

const T0 = new Date('2026-10-05T14:00:00Z');
const minutos = (n: number) => new Date(T0.getTime() + n * 60_000);

export function contratoAlertaDAO(nombre: string, crearEntorno: () => Promise<EntornoAlertaDAO>): void {
  describe(`AlertaDAO contract: ${nombre}`, () => {
    let dao: AlertaDAO;
    let sembrador: Sembrador;
    let usuarioId: number;
    let lugarId: number;
    beforeEach(async () => {
      ({ dao, sembrador } = await crearEntorno());
      usuarioId = await sembrador.usuario();
      lugarId = await sembrador.lugar();
    });

    const alertar = async (fecha: Date, destinatario = usuarioId) =>
      dao.crear({
        favoritoId: await sembrador.favorito(destinatario, lugarId),
        usuarioId: destinatario,
        lugarId,
        nivelAnterior: 'MODERADO',
        nivelNuevo: 'SATURADO',
        mensaje: 'Parque Kennedy ahora esta Saturado.',
        fechaHora: fecha,
      });

    it('crea la alerta no leida con sus niveles y mensaje', async () => {
      const alerta = await alertar(T0);
      expect(alerta).toMatchObject({ usuarioId, lugarId, nivelAnterior: 'MODERADO', nivelNuevo: 'SATURADO', leida: false });
      expect(alerta.mensaje).toBe('Parque Kennedy ahora esta Saturado.');
    });

    it('acepta nivelAnterior null (primer nivel conocido del lugar)', async () => {
      const alerta = await dao.crear({
        favoritoId: await sembrador.favorito(usuarioId, lugarId),
        usuarioId,
        lugarId,
        nivelAnterior: null,
        nivelNuevo: 'TRANQUILO',
        mensaje: 'x',
        fechaHora: T0,
      });
      expect(alerta.nivelAnterior).toBeNull();
    });

    it('listarPorUsuario pagina solo las del usuario, la mas nueva primero', async () => {
      const a = await alertar(T0);
      const b = await alertar(minutos(5));
      const c = await alertar(minutos(10));
      await alertar(minutos(20), await sembrador.usuario());
      const pagina = await dao.listarPorUsuario(usuarioId, { page: 1, size: 2 });
      expect(pagina).toMatchObject({ total: 3, totalPaginas: 2 });
      expect(pagina.items.map((x) => x.id)).toEqual([c.id, b.id]);
      expect((await dao.listarPorUsuario(usuarioId, { page: 2, size: 2 })).items.map((x) => x.id)).toEqual([a.id]);
    });

    it('marcarLeida es idempotente y devuelve null para id ajeno o inexistente', async () => {
      const alerta = await alertar(T0);
      const ajena = await alertar(T0, await sembrador.usuario());
      expect((await dao.marcarLeida(alerta.id, usuarioId))?.leida).toBe(true);
      expect((await dao.marcarLeida(alerta.id, usuarioId))?.leida).toBe(true);
      expect(await dao.marcarLeida(ajena.id, usuarioId)).toBeNull();
      expect(await dao.marcarLeida(alerta.id + 1000, usuarioId)).toBeNull();
    });

    it('contarNoLeidas refleja solo las no leidas del usuario', async () => {
      const a = await alertar(T0);
      await alertar(minutos(1));
      await alertar(minutos(2), await sembrador.usuario());
      expect(await dao.contarNoLeidas(usuarioId)).toBe(2);
      await dao.marcarLeida(a.id, usuarioId);
      expect(await dao.contarNoLeidas(usuarioId)).toBe(1);
    });

    it('crear con favorito, usuario o lugar inexistente lanza ForeignKeyConstraintError', async () => {
      const favoritoId = await sembrador.favorito(usuarioId, lugarId);
      const base = {
        favoritoId,
        usuarioId,
        lugarId,
        nivelAnterior: null,
        nivelNuevo: 'SATURADO' as const,
        mensaje: 'x',
        fechaHora: T0,
      };
      await expect(dao.crear({ ...base, favoritoId: ID_INEXISTENTE })).rejects.toBeInstanceOf(ForeignKeyConstraintError);
      await expect(dao.crear({ ...base, usuarioId: ID_INEXISTENTE })).rejects.toBeInstanceOf(ForeignKeyConstraintError);
      await expect(dao.crear({ ...base, lugarId: ID_INEXISTENTE })).rejects.toBeInstanceOf(ForeignKeyConstraintError);
      expect(await dao.contarNoLeidas(usuarioId)).toBe(0);
    });

    casosPaginacion('listarPorUsuario', async () => {
      await alertar(T0);
      await alertar(T0);
      await alertar(T0);
      return (paginacion) => dao.listarPorUsuario(usuarioId, paginacion);
    });
  });
}
