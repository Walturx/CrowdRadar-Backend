/** Sequelize-only: the token upsert is atomic, so concurrent registrations of one token never duplicate or fail. */
import { describe, expect, it } from 'vitest';
import { DispositivoDAOSequelize } from '../../src/dao/impl/sequelize/DispositivoDAOSequelize.js';
import { PlataformaPush } from '../../src/enum/PlataformaPush.js';
import { crearSembradorSequelize } from '../support/dao/sequelize/SembradorSequelize.js';
import { ejecutarContratoDAO } from './ejecutarContratoDAO.js';
import type { Sembrador } from './Sembrador.js';

interface Entorno {
  dao: DispositivoDAOSequelize;
  sembrador: Sembrador;
}

ejecutarContratoDAO<Entorno>({
  titulo: 'DispositivoDAOSequelize concurrencia (PostgreSQL)',
  contrato: (nombre, crearEntorno) =>
    describe(`DispositivoDAO concurrencia: ${nombre}`, () => {
      it('dos usuarios registran el mismo token a la vez: queda una fila y exactamente un registro es creacion', async () => {
        const { dao, sembrador } = await crearEntorno();
        const [a, b] = [await sembrador.usuario(), await sembrador.usuario()];
        const resultados = await Promise.all([
          dao.registrar(a, 'tok-carrera', PlataformaPush.ANDROID),
          dao.registrar(b, 'tok-carrera', PlataformaPush.IOS),
        ]);
        expect(resultados.filter((r) => r.creado)).toHaveLength(1);
        const tokensA = await dao.listarTokensPorUsuario(a);
        const tokensB = await dao.listarTokensPorUsuario(b);
        expect(tokensA.length + tokensB.length).toBe(1);
      });
    }),
  crearEntorno: (sequelize) => ({ dao: new DispositivoDAOSequelize(), sembrador: crearSembradorSequelize(sequelize) }),
});
