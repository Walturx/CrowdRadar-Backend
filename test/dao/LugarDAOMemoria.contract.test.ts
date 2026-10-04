import { LugarDAOMemoria } from '../support/dao/memoria/LugarDAOMemoria.js';
import { contratoLugarDAO } from './LugarDAO.contract.js';

const LIMITE_MAX = 10;

contratoLugarDAO('memoria', async () => {
  const dao = new LugarDAOMemoria({ limiteMax: LIMITE_MAX });
  return { dao, sembrar: async (lugares) => lugares.map((l) => dao.agregar(l)), limiteMax: LIMITE_MAX };
});
