/**
 * Runs a DAO contract suite against a Sequelize implementation on a throwaway migrated PostgreSQL database.
 * Opt-in: without DATABASE_URL_TEST the whole block is skipped (`npm run test:db` refuses to run without it).
 *
 * Every stream calls it once per DAO it implements, with the SAME `contratoXxxDAO` function the in-memory fake
 * already passes; see `test/dao/plantilla.sequelize.contract.test.ts.md`.
 */
import { Sequelize } from 'sequelize';
import { afterAll, beforeAll, describe } from 'vitest';
import { initModels } from '../../src/dao/impl/sequelize/model/initModels.js';
import { URL_BD_TEST, crearBdTemporal, ejecutarCli, type BaseTemporal } from '../support/baseDatos.js';

/** A contract function such as `contratoUsuarioDAO`: registers its `describe` for the environment it is given. */
export type FuncionContrato<Entorno> = (nombre: string, crearEntorno: () => Promise<Entorno>) => void;

export interface OpcionesContratoDAO<Entorno> {
  /** Title of the block, e.g. `UsuarioDAOSequelize (PostgreSQL)`. */
  titulo: string;
  /** The shared contract function (`contratoUsuarioDAO`, ...). */
  contrato: FuncionContrato<Entorno>;
  /**
   * Builds the environment of ONE test (a DAO plus a `Sembrador` when the contract needs seeded rows).
   * Runs before each test against the shared migrated database; models are already initialised.
   */
  crearEntorno: (sequelize: Sequelize) => Promise<Entorno> | Entorno;
}

export function ejecutarContratoDAO<Entorno>({ titulo, contrato, crearEntorno }: OpcionesContratoDAO<Entorno>): void {
  describe.skipIf(!URL_BD_TEST)(titulo, () => {
    let bd: BaseTemporal;
    let sequelize: Sequelize;

    beforeAll(async () => {
      bd = await crearBdTemporal(URL_BD_TEST as string);
      const migracion = await ejecutarCli(['db:migrate'], bd.url);
      if (migracion.codigo !== 0) throw new Error(migracion.salida);
      sequelize = new Sequelize(bd.url, {
        dialect: 'postgres',
        logging: false,
        define: { underscored: true, freezeTableName: true },
      });
      initModels(sequelize);
    });

    afterAll(async () => {
      await sequelize?.close();
      await bd?.eliminar();
    });

    contrato('sequelize', async () => crearEntorno(sequelize));
  });
}
