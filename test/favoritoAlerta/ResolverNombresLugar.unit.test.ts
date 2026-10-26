import { describe, expect, it } from 'vitest';
import { resolverNombresDesde } from '../../src/dao/ResolverNombresLugar.js';
import { LugarDAOMemoria } from '../support/dao/memoria/LugarDAOMemoria.js';

describe('resolverNombresDesde', () => {
  it('mapea id a nombre solo para los lugares que existen y sin duplicar ids', async () => {
    const lugares = new LugarDAOMemoria();
    const kennedy = lugares.agregar({ nombre: 'Parque Kennedy' });
    const armas = lugares.agregar({ nombre: 'Plaza de Armas' });
    const nombres = await resolverNombresDesde(lugares)([kennedy.id, armas.id, kennedy.id, 424242]);
    expect([...nombres.entries()].sort()).toEqual(
      [
        [kennedy.id, 'Parque Kennedy'],
        [armas.id, 'Plaza de Armas'],
      ].sort(),
    );
  });

  it('sin ids no consulta el DAO y devuelve un mapa vacio', async () => {
    let consultas = 0;
    const lugares = new LugarDAOMemoria();
    const original = lugares.buscarPorIds.bind(lugares);
    lugares.buscarPorIds = async (ids) => {
      consultas += 1;
      return original(ids);
    };
    const nombres = await resolverNombresDesde(lugares)([]);
    expect(nombres.size).toBe(0);
    expect(consultas).toBe(0);
  });
});
