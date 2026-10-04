/**
 * Shared contract every LugarDAO implementation must satisfy (in-memory fake now,
 * Sequelize in M2). Spec M2 R1, R2, R4; M3 explorar/categorias; design 4.3.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import type { LugarDAO } from '../../src/dao/LugarDAO.js';
import type { Lugar } from '../../src/entity/Lugar.js';
import { CategoriaLugar } from '../../src/enum/CategoriaLugar.js';
import { nivelEfectivo } from '../../src/entity/nivelEfectivo.js';
import { NivelEfectivo, NivelSaturacion } from '../../src/enum/NivelSaturacion.js';

export interface EntornoLugarDAO {
  dao: LugarDAO;
  /** Persists the given places (defaults filled in) and returns them with their ids. */
  sembrar(lugares: Partial<Lugar>[]): Promise<Lugar[]>;
  /** The hard cap this DAO was built with (`LUGARES_LIMITE_MAX` in production). */
  limiteMax: number;
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

      it('ordena por nombre normalizado en orden de bytes: espacios, signos y digitos antes que el guion bajo y las letras', async () => {
        await entorno.sembrar(
          ['Plaza_Sur', 'Plaza-Norte', 'Plaza Norte', 'Plaza 2', 'Plaza 10', 'Plaza (Sur)'].map((nombre) => ({ nombre })),
        );
        const lugares = await entorno.dao.buscar({ q: 'plaza', limite: 50 });
        expect(lugares.map((l) => l.nombre)).toEqual(['Plaza (Sur)', 'Plaza 10', 'Plaza 2', 'Plaza Norte', 'Plaza-Norte', 'Plaza_Sur']);
      });

      it('nombres que solo difieren en mayusculas se desempatan por el nombre exacto y luego por id', async () => {
        const [b, a, c] = await entorno.sembrar([{ nombre: 'arbol' }, { nombre: 'Arbol' }, { nombre: 'arbol' }]);
        const lugares = await entorno.dao.buscar({ q: 'ARBOL', limite: 50 });
        expect(lugares.map((l) => l.id)).toEqual([a!.id, b!.id, c!.id]);
      });

      it('una letra fuera de la lista de acentos se compara tal cual en q y en el nombre', async () => {
        await entorno.sembrar([{ nombre: 'Plaza Łódź' }]);
        expect((await entorno.dao.buscar({ q: 'ŁÓDź', limite: 50 })).map((l) => l.nombre)).toEqual(['Plaza Łódź']);
        expect(await entorno.dao.buscar({ q: 'lodz', limite: 50 })).toEqual([]);
        expect(await entorno.dao.buscar({ q: 'łódź', limite: 50 })).toEqual([]);
      });

      it('el nivel efectivo del filtro coincide con la regla de nivelEfectivo() en filas vigentes, en el borde, vencidas y sin lectura', async () => {
        const vigenteDesde = haceMin(60);
        const filas = await entorno.sembrar([
          { nombre: 'Fresca', saturacionActual: NivelSaturacion.SATURADO, saturacionActualizadaEn: haceMin(5) },
          { nombre: 'Borde', saturacionActual: NivelSaturacion.MODERADO, saturacionActualizadaEn: vigenteDesde },
          { nombre: 'Vencida', saturacionActual: NivelSaturacion.TRANQUILO, saturacionActualizadaEn: haceMin(61) },
          { nombre: 'Sin fecha', saturacionActual: NivelSaturacion.SATURADO, saturacionActualizadaEn: null },
          { nombre: 'Sin lectura', saturacionActual: null },
        ]);
        for (const nivel of Object.values(NivelEfectivo)) {
          const porFiltro = (await entorno.dao.buscar({ nivel, vigenteDesde, limite: 50 })).map((l) => l.id).sort();
          const porRegla = filas.filter((l) => nivelEfectivo(l, vigenteDesde) === nivel).map((l) => l.id).sort();
          expect(porFiltro, nivel).toEqual(porRegla);
        }
      });

      it('limite recorta el resultado ordenado', async () => {
        await entorno.sembrar([{ nombre: 'C' }, { nombre: 'A' }, { nombre: 'B' }]);
        expect((await entorno.dao.buscar({ limite: 2 })).map((l) => l.nombre)).toEqual(['A', 'B']);
      });
    });

    describe('explorar / contarPorCategoria', () => {
      it('explorar filtra por categoria y bbox', async () => {
        await entorno.sembrar([
          { nombre: 'P1', categoria: CategoriaLugar.PARQUE },
          { nombre: 'P2', categoria: CategoriaLugar.PARQUE },
          { nombre: 'M1', categoria: CategoriaLugar.MERCADO },
          { nombre: 'P lejos', categoria: CategoriaLugar.PARQUE, latitud: -11.9 },
        ]);
        const parques = await entorno.dao.explorar({ categoria: CategoriaLugar.PARQUE, bbox: ZONA_MIRAFLORES, limite: 50 });
        expect(parques.map((l) => l.nombre)).toEqual(['P1', 'P2']);
        expect(await entorno.dao.explorar({ categoria: CategoriaLugar.PLAYA, limite: 50 })).toEqual([]);
      });

      it('explorar y buscar nunca devuelven mas del tope configurado, aunque pidan mas', async () => {
        await entorno.sembrar(Array.from({ length: entorno.limiteMax + 2 }, (_, i) => ({ nombre: `Lugar ${String(i).padStart(2, '0')}` })));
        expect(await entorno.dao.explorar({ limite: entorno.limiteMax + 100 })).toHaveLength(entorno.limiteMax);
        expect(await entorno.dao.buscar({ limite: entorno.limiteMax + 100 })).toHaveLength(entorno.limiteMax);
      });

      it('explorar respeta un limite menor al tope y devuelve ordenado por nombre', async () => {
        await entorno.sembrar([{ nombre: 'C' }, { nombre: 'A' }, { nombre: 'B' }]);
        expect((await entorno.dao.explorar({ limite: 2 })).map((l) => l.nombre)).toEqual(['A', 'B']);
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
