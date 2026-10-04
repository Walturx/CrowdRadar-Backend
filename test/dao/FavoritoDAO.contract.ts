/** Shared contract for FavoritoDAO (M3). Spec M3 R1-R5: unique (usuario, lugar), alerts on by default. */
import { beforeEach, describe, expect, it } from 'vitest';
import type { FavoritoDAO } from '../../src/dao/FavoritoDAO.js';
import { ConflictoException } from '../../src/exception/http/ConflictoException.js';
import type { Sembrador } from './Sembrador.js';

export interface EntornoFavoritoDAO {
  dao: FavoritoDAO;
  sembrador: Sembrador;
}

export function contratoFavoritoDAO(nombre: string, crearEntorno: () => Promise<EntornoFavoritoDAO>): void {
  describe(`FavoritoDAO contract: ${nombre}`, () => {
    let dao: FavoritoDAO;
    let sembrador: Sembrador;
    let usuarioId: number;
    let lugarId: number;
    beforeEach(async () => {
      ({ dao, sembrador } = await crearEntorno());
      usuarioId = await sembrador.usuario();
      lugarId = await sembrador.lugar();
    });

    it('crea con alertas activadas y buscar lo recupera; otro par devuelve null', async () => {
      const favorito = await dao.crear(usuarioId, lugarId);
      expect(favorito).toMatchObject({ usuarioId, lugarId, alertasActivadas: true });
      expect((await dao.buscar(usuarioId, lugarId))?.id).toBe(favorito.id);
      expect(await dao.buscar(usuarioId, lugarId + 1)).toBeNull();
      expect(await dao.buscar(usuarioId + 1, lugarId)).toBeNull();
    });

    it('crear dos veces el mismo par lanza ConflictoException y deja una sola fila', async () => {
      await dao.crear(usuarioId, lugarId);
      await expect(dao.crear(usuarioId, lugarId)).rejects.toBeInstanceOf(ConflictoException);
      expect(await dao.listarPorUsuario(usuarioId)).toHaveLength(1);
    });

    it('listarPorUsuario devuelve solo los del usuario, el mas reciente primero', async () => {
      const segundoLugar = await sembrador.lugar();
      const primero = await dao.crear(usuarioId, lugarId);
      const segundo = await dao.crear(usuarioId, segundoLugar);
      await dao.crear(await sembrador.usuario(), lugarId);
      expect((await dao.listarPorUsuario(usuarioId)).map((f) => f.id)).toEqual([segundo.id, primero.id]);
    });

    it('eliminar devuelve true una vez y false despues; no toca favoritos ajenos', async () => {
      const ajeno = await sembrador.usuario();
      await dao.crear(usuarioId, lugarId);
      await dao.crear(ajeno, lugarId);
      expect(await dao.eliminar(usuarioId, lugarId)).toBe(true);
      expect(await dao.eliminar(usuarioId, lugarId)).toBe(false);
      expect(await dao.buscar(ajeno, lugarId)).not.toBeNull();
    });

    it('actualizarAlertas es idempotente y devuelve null si no es favorito', async () => {
      await dao.crear(usuarioId, lugarId);
      expect((await dao.actualizarAlertas(usuarioId, lugarId, false))?.alertasActivadas).toBe(false);
      expect((await dao.actualizarAlertas(usuarioId, lugarId, false))?.alertasActivadas).toBe(false);
      expect((await dao.actualizarAlertas(usuarioId, lugarId, true))?.alertasActivadas).toBe(true);
      expect(await dao.actualizarAlertas(usuarioId, lugarId + 1, true)).toBeNull();
    });

    it('listarConAlertasPorLugar excluye los de alertas apagadas y los de otros lugares', async () => {
      const encendido = await dao.crear(usuarioId, lugarId);
      const apagadoUsuario = await sembrador.usuario();
      await dao.crear(apagadoUsuario, lugarId);
      await dao.actualizarAlertas(apagadoUsuario, lugarId, false);
      await dao.crear(await sembrador.usuario(), await sembrador.lugar());
      expect((await dao.listarConAlertasPorLugar(lugarId)).map((f) => f.id)).toEqual([encendido.id]);
    });
  });
}
