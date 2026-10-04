/**
 * Integrante: stream M3 (exploracion)
 * Tecnica: caja negra (particiones de equivalencia por filtro; frontera del radio; orden y corte)
 * Metodo: ExploracionServiceImpl.explorar / listarCategorias (spec M3 explorar S30-S39, design 4.3)
 */
import { describe, expect, it } from 'vitest';
import type { FiltroExploracion } from '../../src/dao/LugarDAO.js';
import { CategoriaLugar } from '../../src/enum/CategoriaLugar.js';
import { NivelEfectivo, NivelSaturacion } from '../../src/enum/NivelSaturacion.js';
import { ExploracionServiceImpl } from '../../src/service/impl/ExploracionServiceImpl.js';
import { RelojFijo } from '../support/RelojFijo.js';
import { LugarDAOMemoria } from '../support/dao/memoria/LugarDAOMemoria.js';

const AHORA = new Date('2026-10-05T14:00:00Z');
const haceMin = (min: number) => new Date(AHORA.getTime() - min * 60_000);
const CENTRO = { lat: -12.12, lng: -77.03 };
const KM_POR_GRADO = 111.195;
/** A place `km` kilometres north of the reference point. */
const alNorte = (km: number) => ({ latitud: CENTRO.lat + km / KM_POR_GRADO, longitud: CENTRO.lng });

function armar(limiteMax = 200) {
  const lugarDAO = new LugarDAOMemoria();
  const llamadas: FiltroExploracion[] = [];
  const original = lugarDAO.explorar.bind(lugarDAO);
  lugarDAO.explorar = (filtro) => {
    llamadas.push(filtro);
    return original(filtro);
  };
  const service = new ExploracionServiceImpl({
    lugarDAO,
    reloj: new RelojFijo(AHORA),
    ventanaSaturacionMin: 60,
    limiteMax,
  });
  return { lugarDAO, service, llamadas };
}

const consulta = (extra: Record<string, unknown> = {}) => ({ radioKm: 2, limite: 50, ...extra });

describe('ExploracionServiceImpl.explorar', () => {
  it('sin filtros devuelve todo por nombre, sin distancia, y lee el DAO con el tope configurado', async () => {
    const { lugarDAO, service, llamadas } = armar(120);
    lugarDAO.agregar({ nombre: 'B' });
    lugarDAO.agregar({ nombre: 'A' });
    const res = await service.explorar(consulta());
    expect(res.map((r) => [r.lugar.nombre, r.distanciaMetros])).toEqual([['A', null], ['B', null]]);
    expect(llamadas).toEqual([{ limite: 120 }]);
  });

  it('con lat/lng ordena por distancia, informa distanciaMetros y pasa un bbox al DAO (S30)', async () => {
    const { lugarDAO, service, llamadas } = armar();
    lugarDAO.agregar({ nombre: 'Lejos', ...alNorte(1.5) });
    lugarDAO.agregar({ nombre: 'Cerca', ...alNorte(0.2) });
    const res = await service.explorar(consulta({ lat: CENTRO.lat, lng: CENTRO.lng }));
    expect(res.map((r) => r.lugar.nombre)).toEqual(['Cerca', 'Lejos']);
    expect(res[0]?.distanciaMetros).toBeCloseTo(200, -1);
    expect(llamadas[0]?.bbox).toBeDefined();
  });

  it('el radio es inclusivo y excluye lo que lo supera (S37: 1.999 km entra, 2.01 km no)', async () => {
    const { lugarDAO, service } = armar();
    lugarDAO.agregar({ nombre: 'Dentro', ...alNorte(1.999) });
    lugarDAO.agregar({ nombre: 'Fuera', ...alNorte(2.01) });
    const res = await service.explorar(consulta({ lat: CENTRO.lat, lng: CENTRO.lng, radioKm: 2 }));
    expect(res.map((r) => r.lugar.nombre)).toEqual(['Dentro']);
  });

  it('filtra por categoria en el DAO (S30, S31)', async () => {
    const { lugarDAO, service, llamadas } = armar();
    lugarDAO.agregar({ nombre: 'Parque', categoria: CategoriaLugar.PARQUE });
    lugarDAO.agregar({ nombre: 'Mercado', categoria: CategoriaLugar.MERCADO });
    expect((await service.explorar(consulta({ categoria: CategoriaLugar.MERCADO }))).map((r) => r.lugar.nombre)).toEqual(['Mercado']);
    expect(llamadas[0]?.categoria).toBe(CategoriaLugar.MERCADO);
  });

  it('filtra por nivel efectivo: un MODERADO vencido cuenta como SIN_INFORMACION (S33)', async () => {
    const { lugarDAO, service } = armar();
    lugarDAO.agregar({ nombre: 'Tranquilo', saturacionActual: NivelSaturacion.TRANQUILO, saturacionActualizadaEn: haceMin(5) });
    lugarDAO.agregar({ nombre: 'Vencido', saturacionActual: NivelSaturacion.MODERADO, saturacionActualizadaEn: haceMin(90) });
    lugarDAO.agregar({ nombre: 'Nunca' });
    const nombres = async (nivel: NivelEfectivo) => (await service.explorar(consulta({ nivel }))).map((r) => r.lugar.nombre);
    expect(await nombres(NivelEfectivo.TRANQUILO)).toEqual(['Tranquilo']);
    expect(await nombres(NivelEfectivo.MODERADO)).toEqual([]);
    expect(await nombres(NivelEfectivo.SIN_INFORMACION)).toEqual(['Nunca', 'Vencido']);
  });

  it('combina los filtros con AND (S36)', async () => {
    const { lugarDAO, service } = armar();
    const fresco = { saturacionActual: NivelSaturacion.SATURADO, saturacionActualizadaEn: haceMin(5) };
    lugarDAO.agregar({ nombre: 'Parque saturado', categoria: CategoriaLugar.PARQUE, ...fresco });
    lugarDAO.agregar({ nombre: 'Mercado saturado', categoria: CategoriaLugar.MERCADO, ...fresco });
    lugarDAO.agregar({ nombre: 'Parque libre', categoria: CategoriaLugar.PARQUE });
    const res = await service.explorar(consulta({ categoria: CategoriaLugar.PARQUE, nivel: NivelEfectivo.SATURADO }));
    expect(res.map((r) => r.lugar.nombre)).toEqual(['Parque saturado']);
    expect(res[0]?.nivel).toBe(NivelEfectivo.SATURADO);
  });

  it('corta en limite despues de filtrar y ordenar, no antes', async () => {
    const { lugarDAO, service } = armar();
    lugarDAO.agregar({ nombre: 'A lejos', ...alNorte(1.8) });
    lugarDAO.agregar({ nombre: 'B medio', ...alNorte(0.9) });
    lugarDAO.agregar({ nombre: 'C cerca', ...alNorte(0.1) });
    const res = await service.explorar(consulta({ lat: CENTRO.lat, lng: CENTRO.lng, limite: 2 }));
    expect(res.map((r) => r.lugar.nombre)).toEqual(['C cerca', 'B medio']);
  });
});

describe('ExploracionServiceImpl.listarCategorias', () => {
  it('devuelve las 6 categorias con su total, 0 incluido', async () => {
    const { lugarDAO, service } = armar();
    lugarDAO.agregar({ categoria: CategoriaLugar.PLAYA });
    const conteo = await service.listarCategorias();
    expect(conteo).toHaveLength(6);
    expect(conteo.find((c) => c.categoria === CategoriaLugar.PLAYA)?.total).toBe(1);
    expect(conteo.find((c) => c.categoria === CategoriaLugar.PARQUE)?.total).toBe(0);
  });
});
