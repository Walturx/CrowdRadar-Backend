/** Shared contract for DispositivoDAO (M3). Spec M3 R7: upsert by token, ownership moves with re-registration. */
import { beforeEach, describe, expect, it } from 'vitest';
import { ForeignKeyConstraintError } from 'sequelize';
import type { DispositivoDAO } from '../../src/dao/DispositivoDAO.js';
import { PlataformaPush } from '../../src/enum/PlataformaPush.js';
import { ID_INEXISTENTE, type Sembrador } from './Sembrador.js';

export interface EntornoDispositivoDAO {
  dao: DispositivoDAO;
  sembrador: Sembrador;
}

export function contratoDispositivoDAO(nombre: string, crearEntorno: () => Promise<EntornoDispositivoDAO>): void {
  describe(`DispositivoDAO contract: ${nombre}`, () => {
    let dao: DispositivoDAO;
    let sembrador: Sembrador;
    let usuarioId: number;
    beforeEach(async () => {
      ({ dao, sembrador } = await crearEntorno());
      usuarioId = await sembrador.usuario();
    });

    it('registrar crea el dispositivo (creado true) y repetir el mismo token no duplica (creado false)', async () => {
      const nuevo = await dao.registrar(usuarioId, 'tok-1', PlataformaPush.ANDROID);
      expect(nuevo.creado).toBe(true);
      expect(nuevo.dispositivo).toMatchObject({ usuarioId, tokenFcm: 'tok-1', plataforma: 'ANDROID' });
      const repetido = await dao.registrar(usuarioId, 'tok-1', PlataformaPush.IOS);
      expect(repetido.creado).toBe(false);
      expect(repetido.dispositivo).toMatchObject({ id: nuevo.dispositivo.id, plataforma: 'IOS' });
      expect(await dao.listarTokensPorUsuario(usuarioId)).toEqual(['tok-1']);
    });

    it('un token registrado por otro usuario pasa a pertenecer al nuevo usuario (creado false: la fila ya existia)', async () => {
      const otro = await sembrador.usuario();
      expect((await dao.registrar(usuarioId, 'tok-compartido', PlataformaPush.ANDROID)).creado).toBe(true);
      expect((await dao.registrar(otro, 'tok-compartido', PlataformaPush.ANDROID)).creado).toBe(false);
      expect(await dao.listarTokensPorUsuario(usuarioId)).toEqual([]);
      expect(await dao.listarTokensPorUsuario(otro)).toEqual(['tok-compartido']);
    });

    it('eliminarPorToken solo borra el token propio y es idempotente', async () => {
      const otro = await sembrador.usuario();
      await dao.registrar(usuarioId, 'mio', PlataformaPush.ANDROID);
      await dao.registrar(otro, 'ajeno', PlataformaPush.IOS);
      expect(await dao.eliminarPorToken(usuarioId, 'ajeno')).toBe(false);
      expect(await dao.eliminarPorToken(usuarioId, 'mio')).toBe(true);
      expect(await dao.eliminarPorToken(usuarioId, 'mio')).toBe(false);
      expect(await dao.listarTokensPorUsuario(otro)).toEqual(['ajeno']);
    });

    it('eliminarTokens borra los indicados de cualquier usuario y cuenta los borrados', async () => {
      await dao.registrar(usuarioId, 'a', PlataformaPush.ANDROID);
      await dao.registrar(usuarioId, 'b', PlataformaPush.ANDROID);
      await dao.registrar(await sembrador.usuario(), 'c', PlataformaPush.IOS);
      expect(await dao.eliminarTokens(['a', 'c', 'inexistente'])).toBe(2);
      expect(await dao.listarTokensPorUsuario(usuarioId)).toEqual(['b']);
      expect(await dao.eliminarTokens([])).toBe(0);
    });

    it('eliminarDeUsuario borra todos los dispositivos del usuario y ninguno ajeno (R1-1304)', async () => {
      const otro = await sembrador.usuario();
      await dao.registrar(usuarioId, 'a', PlataformaPush.ANDROID);
      await dao.registrar(usuarioId, 'b', PlataformaPush.IOS);
      await dao.registrar(otro, 'c', PlataformaPush.IOS);
      expect(await dao.eliminarDeUsuario(usuarioId)).toBe(2);
      expect(await dao.listarTokensPorUsuario(usuarioId)).toEqual([]);
      expect(await dao.listarTokensPorUsuario(otro)).toEqual(['c']);
      expect(await dao.eliminarDeUsuario(usuarioId)).toBe(0);
    });

    describe('conservarMasRecientes', () => {
      it('borra los mas antiguos del usuario por encima del maximo y devuelve cuantos borro', async () => {
        for (const token of ['a', 'b', 'c']) await dao.registrar(usuarioId, token, PlataformaPush.ANDROID);
        expect(await dao.conservarMasRecientes(usuarioId, 2)).toBe(1);
        expect(await dao.listarTokensPorUsuario(usuarioId)).toEqual(['b', 'c']);
      });

      it('volver a registrar un token lo rejuvenece: el que se borra es el que lleva mas sin usarse', async () => {
        for (const token of ['a', 'b', 'c']) await dao.registrar(usuarioId, token, PlataformaPush.ANDROID);
        await dao.registrar(usuarioId, 'a', PlataformaPush.ANDROID);
        expect(await dao.conservarMasRecientes(usuarioId, 2)).toBe(1);
        expect((await dao.listarTokensPorUsuario(usuarioId)).sort()).toEqual(['a', 'c']);
      });

      it('con el usuario por debajo del maximo no borra nada y nunca toca a otros usuarios', async () => {
        const otro = await sembrador.usuario();
        await dao.registrar(usuarioId, 'a', PlataformaPush.ANDROID);
        for (const token of ['x', 'y', 'z']) await dao.registrar(otro, token, PlataformaPush.IOS);
        expect(await dao.conservarMasRecientes(usuarioId, 2)).toBe(0);
        expect(await dao.conservarMasRecientes(otro, 1)).toBe(2);
        expect(await dao.listarTokensPorUsuario(usuarioId)).toEqual(['a']);
        expect(await dao.listarTokensPorUsuario(otro)).toEqual(['z']);
      });
    });

    it('registrar para un usuario inexistente lanza ForeignKeyConstraintError', async () => {
      await expect(dao.registrar(ID_INEXISTENTE, 'tok-fk', PlataformaPush.ANDROID)).rejects.toBeInstanceOf(
        ForeignKeyConstraintError,
      );
    });
  });
}
