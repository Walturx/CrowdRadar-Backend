import { LugarDAOMemoria } from '../support/dao/memoria/LugarDAOMemoria.js';
import { contratoLugarDAO } from './LugarDAO.contract.js';

contratoLugarDAO('memoria', async () => {
  const dao = new LugarDAOMemoria();
  return { dao, sembrar: async (lugares) => lugares.map((l) => dao.agregar(l)) };
});
