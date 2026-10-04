/** Shared contract for TokenRecuperacionDAO (M1). Design 4.2: only the hash is stored; single use; new request invalidates previous ones. */
import { beforeEach, describe, expect, it } from 'vitest';
import { ForeignKeyConstraintError } from 'sequelize';
import type { TokenRecuperacionDAO } from '../../src/dao/TokenRecuperacionDAO.js';
import { ConflictoException } from '../../src/exception/http/ConflictoException.js';
import { ID_INEXISTENTE, type Sembrador } from './Sembrador.js';

export interface EntornoTokenRecuperacionDAO {
  dao: TokenRecuperacionDAO;
  sembrador: Sembrador;
}

const T0 = new Date('2026-10-05T14:00:00Z');
const minutos = (n: number) => new Date(T0.getTime() + n * 60_000);
/** 64-char hash; the suffix is unique per test because the Sequelize flavour shares one database across tests. */
let prueba = 0;
const hash = (c: string) => c.repeat(56) + prueba.toString(16).padStart(8, '0');

export function contratoTokenRecuperacionDAO(
  nombre: string,
  crearEntorno: () => Promise<EntornoTokenRecuperacionDAO>,
): void {
  describe(`TokenRecuperacionDAO contract: ${nombre}`, () => {
    let dao: TokenRecuperacionDAO;
    let sembrador: Sembrador;
    let usuarioId: number;
    beforeEach(async () => {
      prueba += 1;
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

    it('limitarVigentes conserva solo los N mas recientes vigentes del usuario y gasta los mas viejos (R1-1302)', async () => {
      const otro = await sembrador.usuario();
      await dao.crear({ usuarioId, tokenHash: hash('v'), expiraEn: minutos(5) }); // already expired at minute 10: neither counted nor touched
      for (const c of ['a', 'b', 'c', 'd']) await dao.crear({ usuarioId, tokenHash: hash(c), expiraEn: minutos(30) });
      await dao.crear({ usuarioId: otro, tokenHash: hash('o'), expiraEn: minutos(30) });
      expect(await dao.limitarVigentes(usuarioId, 3, minutos(10))).toBe(1);
      expect((await dao.buscarPorHash(hash('a')))?.usadoEn).toEqual(minutos(10));
      for (const c of ['b', 'c', 'd']) expect((await dao.buscarPorHash(hash(c)))?.usadoEn).toBeNull();
      expect((await dao.buscarPorHash(hash('v')))?.usadoEn).toBeNull();
      expect((await dao.buscarPorHash(hash('o')))?.usadoEn).toBeNull();
      expect(await dao.limitarVigentes(usuarioId, 3, minutos(11))).toBe(0);
    });

    it('crear con un tokenHash repetido lanza ConflictoException (unique) y conserva el primero', async () => {
      const primero = await dao.crear({ usuarioId, tokenHash: hash('u'), expiraEn: minutos(30) });
      await expect(dao.crear({ usuarioId, tokenHash: hash('u'), expiraEn: minutos(60) })).rejects.toBeInstanceOf(
        ConflictoException,
      );
      expect((await dao.buscarPorHash(hash('u')))?.id).toBe(primero.id);
    });

    it('crear con un usuario inexistente lanza ForeignKeyConstraintError', async () => {
      await expect(dao.crear({ usuarioId: ID_INEXISTENTE, tokenHash: hash('f'), expiraEn: minutos(30) })).rejects.toBeInstanceOf(
        ForeignKeyConstraintError,
      );
    });
  });
}
