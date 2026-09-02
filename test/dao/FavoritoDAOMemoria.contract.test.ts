import { FavoritoDAOMemoria } from '../support/dao/memoria/FavoritoDAOMemoria.js';
import { crearSembradorMemoria } from '../support/dao/memoria/SembradorMemoria.js';
import { contratoFavoritoDAO } from './FavoritoDAO.contract.js';

contratoFavoritoDAO('memoria', async () => ({ dao: new FavoritoDAOMemoria(), sembrador: crearSembradorMemoria() }));
