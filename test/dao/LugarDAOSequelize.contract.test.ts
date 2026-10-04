/**
 * The shared LugarDAO contract against real PostgreSQL (opt-in: DATABASE_URL_TEST) plus the cases only a
 * database can get wrong: collation-independent ordering, accents in upper case, quoting and numeric types.
 */
import { describe, expect, it } from 'vitest';
import { LugarDAOSequelize } from '../../src/dao/impl/sequelize/LugarDAOSequelize.js';
import { LugarModel } from '../../src/dao/impl/sequelize/model/LugarModel.js';
import type { Lugar } from '../../src/entity/Lugar.js';
import { CategoriaLugar } from '../../src/enum/CategoriaLugar.js';
import { NivelEfectivo, NivelSaturacion } from '../../src/enum/NivelSaturacion.js';
import { aLugar } from '../support/fabrica/datos.js';
import { ejecutarContratoDAO, type FuncionContrato } from './ejecutarContratoDAO.js';
import { contratoLugarDAO, type EntornoLugarDAO } from './LugarDAO.contract.js';

let osmId = 5_000_000;
const LIMITE_MAX = 10;

/** Empty `lugar` table and a fresh DAO; `sembrar` inserts through the model so the DAO under test only reads. */
const crearEntornoSequelize = async (): Promise<EntornoLugarDAO> => {
  await LugarModel.destroy({ where: {} });
  return {
    dao: new LugarDAOSequelize({ limiteMax: LIMITE_MAX }),
    sembrar: sembrarLugares,
    limiteMax: LIMITE_MAX,
  };
};

async function sembrarLugares(lugares: Partial<Lugar>[]): Promise<Lugar[]> {
  const sembrados: Lugar[] = [];
  for (const parcial of lugares) {
    osmId += 1;
    const fila = await LugarModel.create({ ...aLugar({ ...parcial, osmId }), id: undefined });
    sembrados.push((await new LugarDAOSequelize({ limiteMax: LIMITE_MAX }).buscarPorId(fila.id))!);
  }
  return sembrados;
}

const contratoYExtras: FuncionContrato<EntornoLugarDAO> = (nombre, crearEntorno) => {
  contratoLugarDAO(nombre, crearEntorno);

  describe('LugarDAOSequelize: casos propios de PostgreSQL', () => {
    it('ordena por nombre sin acentos aunque la collation de la base sea otra', async () => {
      const entorno = await crearEntorno();
      await entorno.sembrar([{ nombre: 'Zoo' }, { nombre: 'Ñandú' }, { nombre: 'Árbol' }, { nombre: 'Bosque' }]);
      const lugares = await entorno.dao.buscar({ limite: 10 });
      expect(lugares.map((l) => l.nombre)).toEqual(['Árbol', 'Bosque', 'Ñandú', 'Zoo']);
    });

    it('q con acento en mayusculas y con la letra sin acento encuentran el mismo lugar', async () => {
      const entorno = await crearEntornoSembrado();
      expect((await entorno.dao.buscar({ q: 'ÁRBOL', limite: 10 })).map((l) => l.nombre)).toEqual(['Árbol Grande']);
      expect((await entorno.dao.buscar({ q: 'arbol', limite: 10 })).map((l) => l.nombre)).toEqual(['Árbol Grande']);
      expect((await entorno.dao.buscar({ q: 'ÑANDU', limite: 10 })).map((l) => l.nombre)).toEqual(['Ñandú Verde']);
    });

    it('q con comillas y barra invertida se trata como texto, no como SQL', async () => {
      const entorno = await crearEntornoSembrado();
      expect(await entorno.dao.buscar({ q: "'; DROP TABLE lugar;--", limite: 10 })).toEqual([]);
      expect(await entorno.dao.buscar({ q: '\\', limite: 10 })).toEqual([]);
      expect((await entorno.dao.buscar({ limite: 10 })).length).toBe(2);
    });

    it('sin vigenteDesde el nivel guardado se toma tal cual, sea cual sea su antiguedad', async () => {
      const entorno = await crearEntorno();
      const antiguo = new Date('2020-01-01T00:00:00Z');
      await entorno.sembrar([
        { nombre: 'Viejo', saturacionActual: NivelSaturacion.SATURADO, saturacionActualizadaEn: antiguo },
        { nombre: 'Nunca', saturacionActual: null },
      ]);
      expect((await entorno.dao.buscar({ nivel: NivelEfectivo.SATURADO, limite: 10 })).map((l) => l.nombre)).toEqual(['Viejo']);
      expect((await entorno.dao.buscar({ nivel: NivelEfectivo.SIN_INFORMACION, limite: 10 })).map((l) => l.nombre)).toEqual(['Nunca']);
    });

    it('devuelve coordenadas como numeros y fechas como Date', async () => {
      const entorno = await crearEntorno();
      const [lugar] = await entorno.sembrar([
        { nombre: 'Costa', latitud: -12.121791, longitud: -77.030453, categoria: CategoriaLugar.PLAYA },
      ]);
      const leido = await entorno.dao.buscarPorId(lugar!.id);
      expect(leido).toMatchObject({ latitud: -12.121791, longitud: -77.030453, osmTipo: 'node', categoria: 'PLAYA' });
      expect(leido!.createdAt).toBeInstanceOf(Date);
    });
  });
};

async function crearEntornoSembrado(): Promise<EntornoLugarDAO> {
  const entorno = await crearEntornoSequelize();
  await entorno.sembrar([{ nombre: 'Árbol Grande' }, { nombre: 'Ñandú Verde' }]);
  return entorno;
}

ejecutarContratoDAO({
  titulo: 'LugarDAOSequelize (PostgreSQL)',
  contrato: contratoYExtras,
  crearEntorno: () => crearEntornoSequelize(),
});
