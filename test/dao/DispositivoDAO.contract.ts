/** Shared contract for DispositivoDAO (M3). Spec M3 R7: upsert by token, ownership moves with re-registration. */
import { beforeEach, describe, expect, it } from 'vitest';
import type { DispositivoDAO } from '../../src/dao/DispositivoDAO.js';
import { PlataformaPush } from '../../src/enum/PlataformaPush.js';
import type { Sembrador } from './Sembrador.js';

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

    it('un token registrado por otro usuario pasa a pertenecer al nuevo usuario', async () => {
      const otro = await sembrador.usuario();
      await dao.registrar(usuarioId, 'tok-compartido', PlataformaPush.ANDROID);
      await dao.registrar(otro, 'tok-compartido', PlataformaPush.ANDROID);
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
  });
}
