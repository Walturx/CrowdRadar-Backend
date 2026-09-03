import { AlertaDAOMemoria } from '../support/dao/memoria/AlertaDAOMemoria.js';
import { FavoritoDAOMemoria } from '../support/dao/memoria/FavoritoDAOMemoria.js';
import { crearSembradorMemoria } from '../support/dao/memoria/SembradorMemoria.js';
import { contratoFavoritoDAO } from './FavoritoDAO.contract.js';

contratoFavoritoDAO('memoria', async () => {
  const sembrador = crearSembradorMemoria();
  const alertas = new AlertaDAOMemoria({ sembrador });
  return { dao: new FavoritoDAOMemoria({ sembrador, alertas }), sembrador, alertas };
});
