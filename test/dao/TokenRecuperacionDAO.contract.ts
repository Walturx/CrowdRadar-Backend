/** Shared contract for TokenRecuperacionDAO (M1). Design 4.2: only the hash is stored; single use; new request invalidates previous ones. */
import { beforeEach, describe, expect, it } from 'vitest';
import type { TokenRecuperacionDAO } from '../../src/dao/TokenRecuperacionDAO.js';
import type { Sembrador } from './Sembrador.js';

export interface EntornoTokenRecuperacionDAO {
  dao: TokenRecuperacionDAO;
  sembrador: Sembrador;
}

const T0 = new Date('2026-10-05T14:00:00Z');
const minutos = (n: number) => new Date(T0.getTime() + n * 60_000);
const hash = (c: string) => c.repeat(64);

export function contratoTokenRecuperacionDAO(
  nombre: string,
  crearEntorno: () => Promise<EntornoTokenRecuperacionDAO>,
): void {
  describe(`TokenRecuperacionDAO contract: ${nombre}`, () => {
    let dao: TokenRecuperacionDAO;
    let sembrador: Sembrador;
    let usuarioId: number;
    beforeEach(async () => {
      ({ dao, sembrador } = await crearEntorno());
      usuarioId = await sembrador.usuario();
    });

    it('crea sin usar y buscarPorHash lo encuentra; un hash desconocido devuelve null', async () => {
      const token = await dao.crear({ usuarioId, tokenHash: hash('a'), expiraEn: minutos(30) });
      expect(token).toMatchObject({ usuarioId, tokenHash: hash('a'), usadoEn: null });
      expect(token.expiraEn).toEqual(minutos(30));
      expect((await dao.buscarPorHash(hash('a')))?.id).toBe(token.id);
      expect(await dao.buscarPorHash(hash('b'))).toBeNull();
    });

    it('marcarUsado guarda la fecha y devuelve false si el id no existe', async () => {
      const token = await dao.crear({ usuarioId, tokenHash: hash('a'), expiraEn: minutos(30) });
      expect(await dao.marcarUsado(token.id, minutos(5))).toBe(true);
      expect((await dao.buscarPorHash(hash('a')))?.usadoEn).toEqual(minutos(5));
      expect(await dao.marcarUsado(token.id + 1000, minutos(5))).toBe(false);
    });

    it('invalidarVigentesDeUsuario marca solo los no usados del usuario y cuenta cuantos', async () => {
      const otro = await sembrador.usuario();
      const usado = await dao.crear({ usuarioId, tokenHash: hash('a'), expiraEn: minutos(30) });
      await dao.marcarUsado(usado.id, minutos(1));
      await dao.crear({ usuarioId, tokenHash: hash('b'), expiraEn: minutos(30) });
      await dao.crear({ usuarioId, tokenHash: hash('c'), expiraEn: minutos(30) });
      await dao.crear({ usuarioId: otro, tokenHash: hash('d'), expiraEn: minutos(30) });
      expect(await dao.invalidarVigentesDeUsuario(usuarioId, minutos(10))).toBe(2);
      expect((await dao.buscarPorHash(hash('b')))?.usadoEn).toEqual(minutos(10));
      expect((await dao.buscarPorHash(hash('a')))?.usadoEn).toEqual(minutos(1));
      expect((await dao.buscarPorHash(hash('d')))?.usadoEn).toBeNull();
      expect(await dao.invalidarVigentesDeUsuario(usuarioId, minutos(11))).toBe(0);
    });
  });
}
