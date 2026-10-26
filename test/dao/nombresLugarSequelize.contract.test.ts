/** The raw-SQL place-name resolver used by M3 until the places DAO is wired (opt-in: DATABASE_URL_TEST). */
import { QueryTypes } from 'sequelize';
import { describe, expect, it } from 'vitest';
import { nombresLugarSequelize } from '../../src/dao/impl/sequelize/nombresLugarSequelize.js';
import { ejecutarContratoDAO } from './ejecutarContratoDAO.js';

interface Entorno {
  lugar: (nombre: string) => Promise<number>;
}

ejecutarContratoDAO<Entorno>({
  titulo: 'nombresLugarSequelize (PostgreSQL)',
  contrato: (nombre, crearEntorno) =>
    describe(`nombres de lugar: ${nombre}`, () => {
      it('devuelve el nombre de cada lugar existente, ignora ids inexistentes y duplicados', async () => {
        const { lugar } = await crearEntorno();
        const a = await lugar('Parque Kennedy');
        const b = await lugar('Plaza de Armas');
        const nombres = await nombresLugarSequelize([a, b, a, 2_000_000_000]);
        expect(nombres.size).toBe(2);
        expect(nombres.get(a)).toBe('Parque Kennedy');
        expect(nombres.get(b)).toBe('Plaza de Armas');
      });

      it('sin ids devuelve un mapa vacio sin consultar', async () => {
        await crearEntorno();
        expect((await nombresLugarSequelize([])).size).toBe(0);
      });
    }),
  crearEntorno: (sequelize) => ({
    lugar: async (nombre) =>
      (
        await sequelize.query<{ id: number }>(
          `INSERT INTO lugar (nombre, latitud, longitud, categoria) VALUES (:nombre, -12.05, -77.04, 'PLAZA') RETURNING id`,
          { replacements: { nombre }, type: QueryTypes.SELECT },
        )
      )[0]!.id,
  }),
});
