/** Same contract against real PostgreSQL (opt-in: DATABASE_URL_TEST); runs on a throwaway migrated database. */
import { Sequelize } from 'sequelize';
import { afterAll, beforeAll, describe } from 'vitest';
import { UsuarioDAOSequelize } from '../../src/dao/impl/sequelize/UsuarioDAOSequelize.js';
import { initModels } from '../../src/dao/impl/sequelize/model/initModels.js';
import { URL_BD_TEST, crearBdTemporal, ejecutarCli, type BaseTemporal } from '../support/baseDatos.js';
import { contratoUsuarioDAO } from './UsuarioDAO.contract.js';

describe.skipIf(!URL_BD_TEST)('UsuarioDAOSequelize (PostgreSQL)', () => {
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

  contratoUsuarioDAO('sequelize', async () => ({ dao: new UsuarioDAOSequelize() }));
});
