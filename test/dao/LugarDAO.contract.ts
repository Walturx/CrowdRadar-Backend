/**
 * Shared contract every LugarDAO implementation must satisfy (in-memory fake now,
 * Sequelize in M2). Spec M2 R1, R2, R4; M3 explorar/categorias; design 4.3.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import type { LugarDAO } from '../../src/dao/LugarDAO.js';
import type { Lugar } from '../../src/entity/Lugar.js';
import { CategoriaLugar } from '../../src/enum/CategoriaLugar.js';
import { NivelEfectivo, NivelSaturacion } from '../../src/enum/NivelSaturacion.js';

export interface EntornoLugarDAO {
  dao: LugarDAO;
  /** Persists the given places (defaults filled in) and returns them with their ids. */
  sembrar(lugares: Partial<Lugar>[]): Promise<Lugar[]>;
}

const ZONA_MIRAFLORES = { minLng: -77.05, minLat: -12.14, maxLng: -77.0, maxLat: -12.1 };
const T0 = new Date('2026-10-05T15:00:00Z');
const haceMin = (min: number) => new Date(T0.getTime() - min * 60_000);

export function contratoLugarDAO(nombre: string, crearEntorno: () => Promise<EntornoLugarDAO>): void {
  describe(`LugarDAO contract: ${nombre}`, () => {
    let entorno: EntornoLugarDAO;
    beforeEach(async () => {
      entorno = await crearEntorno();
    });

    describe('buscarPorId / buscarPorIds', () => {
      it('devuelve el lugar sembrado y null para un id inexistente', async () => {
        const [lugar] = await entorno.sembrar([{ nombre: 'Parque Kennedy' }]);
        expect((await entorno.dao.buscarPorId(lugar!.id))?.nombre).toBe('Parque Kennedy');
        expect(await entorno.dao.buscarPorId(lugar!.id + 1000)).toBeNull();
      });

      it('buscarPorIds omite los inexistentes y no repite', async () => {
        const [a, b] = await entorno.sembrar([{ nombre: 'A' }, { nombre: 'B' }]);
        const lugares = await entorno.dao.buscarPorIds([a!.id, b!.id, a!.id, 99999]);
        expect(lugares.map((l) => l.nombre).sort()).toEqual(['A', 'B']);
        expect(await entorno.dao.buscarPorIds([])).toEqual([]);
      });
    });

    describe('buscar', () => {
      it('q ignora mayusculas y acentos y ordena por nombre', async () => {
        await entorno.sembrar([{ nombre: 'Parque Zonal' }, { nombre: 'Párque Kennedy' }, { nombre: 'Mercado Central' }]);
        const lugares = await entorno.dao.buscar({ q: 'PARQUE', limite: 50 });
        expect(lugares.map((l) => l.nombre)).toEqual(['Párque Kennedy', 'Parque Zonal']);
      });

      it('% y _ en q son literales, no comodines', async () => {
        await entorno.sembrar([{ nombre: '100% Verde' }, { nombre: 'Parque Sol' }]);
        expect((await entorno.dao.buscar({ q: '%', limite: 50 })).map((l) => l.nombre)).toEqual(['100% Verde']);
        expect(await entorno.dao.buscar({ q: 'Parque_Sol', limite: 50 })).toEqual([]);
      });

      it('bbox incluye los bordes y excluye lo de afuera; combina con categoria (AND)', async () => {
        await entorno.sembrar([
          { nombre: 'Dentro', latitud: -12.12, longitud: -77.03 },
          { nombre: 'Borde', latitud: -12.14, longitud: -77.05, categoria: CategoriaLugar.PLAZA },
          { nombre: 'Fuera', latitud: -12.2, longitud: -77.03 },
        ]);
        const todos = await entorno.dao.buscar({ bbox: ZONA_MIRAFLORES, limite: 50 });
        expect(todos.map((l) => l.nombre)).toEqual(['Borde', 'Dentro']);
        const plazas = await entorno.dao.buscar({ bbox: ZONA_MIRAFLORES, categoria: CategoriaLugar.PLAZA, limite: 50 });
        expect(plazas.map((l) => l.nombre)).toEqual(['Borde']);
      });

      it('nivel usa el nivel vigente; uno vencido o ausente cuenta como SIN_INFORMACION', async () => {
        await entorno.sembrar([
          { nombre: 'Fresco', saturacionActual: NivelSaturacion.MODERADO, saturacionActualizadaEn: haceMin(5) },
          { nombre: 'Vencido', saturacionActual: NivelSaturacion.MODERADO, saturacionActualizadaEn: haceMin(90) },
          { nombre: 'Nunca', saturacionActual: null },
        ]);
        const vigenteDesde = haceMin(60);
        const moderados = await entorno.dao.buscar({ nivel: NivelEfectivo.MODERADO, vigenteDesde, limite: 50 });
        expect(moderados.map((l) => l.nombre)).toEqual(['Fresco']);
        const sinInfo = await entorno.dao.buscar({ nivel: NivelEfectivo.SIN_INFORMACION, vigenteDesde, limite: 50 });
        expect(sinInfo.map((l) => l.nombre)).toEqual(['Nunca', 'Vencido']);
      });

      it('limite recorta el resultado ordenado', async () => {
        await entorno.sembrar([{ nombre: 'C' }, { nombre: 'A' }, { nombre: 'B' }]);
        expect((await entorno.dao.buscar({ limite: 2 })).map((l) => l.nombre)).toEqual(['A', 'B']);
      });
    });

    describe('explorar / contarPorCategoria', () => {
      it('explorar filtra por categoria y bbox sin limite', async () => {
        await entorno.sembrar([
          { nombre: 'P1', categoria: CategoriaLugar.PARQUE },
          { nombre: 'P2', categoria: CategoriaLugar.PARQUE },
          { nombre: 'M1', categoria: CategoriaLugar.MERCADO },
          { nombre: 'P lejos', categoria: CategoriaLugar.PARQUE, latitud: -11.9 },
        ]);
        const parques = await entorno.dao.explorar({ categoria: CategoriaLugar.PARQUE, bbox: ZONA_MIRAFLORES });
        expect(parques.map((l) => l.nombre)).toEqual(['P1', 'P2']);
        expect(await entorno.dao.explorar({ categoria: CategoriaLugar.PLAYA })).toEqual([]);
      });

      it('contarPorCategoria lista las 6 categorias, con 0 donde no hay lugares', async () => {
        await entorno.sembrar([{ categoria: CategoriaLugar.PARQUE }, { categoria: CategoriaLugar.PARQUE }, { categoria: CategoriaLugar.PLAYA }]);
        const conteo = await entorno.dao.contarPorCategoria();
        expect(conteo).toHaveLength(6);
        const total = Object.fromEntries(conteo.map((c) => [c.categoria, c.total]));
        expect(total).toMatchObject({ PARQUE: 2, PLAYA: 1, MERCADO: 0 });
      });
    });

    describe('actualizarSaturacion', () => {
      it('escribe nivel y fecha, y null limpia la lectura', async () => {
        const [lugar] = await entorno.sembrar([{}]);
        const actualizado = await entorno.dao.actualizarSaturacion(lugar!.id, NivelSaturacion.SATURADO, T0);
        expect(actualizado).toMatchObject({ saturacionActual: 'SATURADO', saturacionActualizadaEn: T0 });
        const limpio = await entorno.dao.actualizarSaturacion(lugar!.id, null, haceMin(-1));
        expect(limpio?.saturacionActual).toBeNull();
        expect((await entorno.dao.buscarPorId(lugar!.id))?.saturacionActual).toBeNull();
      });

      it('devuelve null si el lugar no existe', async () => {
        expect(await entorno.dao.actualizarSaturacion(424242, NivelSaturacion.TRANQUILO, T0)).toBeNull();
      });
    });
  });
}
