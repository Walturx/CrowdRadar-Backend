/**
 * Integrante: stream M3 (exploracion)
 * Tecnica: caja negra (particiones de equivalencia + valores limite + tabla de decision) sobre GET /api/lugares/explorar
 * Metodo: entradas categoria, saturacion, lat, lng, radioKm (+ limite); spec M3 explorar S30-S39, HU 3.5 y 3.6
 *
 * Tabla de decision de lat / lng / radioKm (radioKm solo cuenta con coordenadas; sin ellas se ignora):
 *   R1 lat -  lng -  -> 200, orden por nombre, distanciaMetros null
 *   R2 lat ok lng -  -> 400 (campo lng)
 *   R3 lat -  lng ok -> 400 (campo lat)
 *   R4 lat ok lng ok -> 200, orden por distancia, distanciaMetros numerica, radio por defecto 2 km
 *   R5 lat -  lng -  radioKm ok -> 200, el radio se ignora
 *   R6 lat ok lng ok radioKm fuera de rango -> 400
 */
import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { NivelSaturacion } from '../../src/enum/NivelSaturacion.js';
import { crearContenedorPrueba } from '../support/crearContenedorPrueba.js';
import { aUsuario } from '../support/fabrica/datos.js';

const ctx = crearContenedorPrueba();
const app = createApp(ctx.contenedor);
const usuario = ctx.usuarioDAO.agregar(aUsuario({ email: 'explorar@crowdradar.pe' }));
const TOKEN = `Bearer ${ctx.emisorToken.emitir(usuario).token}`;
const explorar = (query = '') => request(app).get(`/api/lugares/explorar${query}`).set('Authorization', TOKEN);

const CENTRO = { lat: -12.12, lng: -77.03 };
const KM_POR_GRADO = 111.195;
const alNorte = (km: number) => ({ latitud: CENTRO.lat + km / KM_POR_GRADO, longitud: CENTRO.lng });
const haceMin = (min: number) => new Date(Date.now() - min * 60_000);
const POS = `lat=${CENTRO.lat}&lng=${CENTRO.lng}`;
const nombres = (res: request.Response) => (res.body.data.items as { nombre: string }[]).map((i) => i.nombre);

beforeAll(() => {
  ctx.lugarDAO.agregar({ nombre: 'Parque Cerca', categoria: 'PARQUE', ...alNorte(0.3), saturacionActual: NivelSaturacion.TRANQUILO, saturacionActualizadaEn: haceMin(5) });
  ctx.lugarDAO.agregar({ nombre: 'Parque Medio', categoria: 'PARQUE', ...alNorte(1.5), saturacionActual: NivelSaturacion.SATURADO, saturacionActualizadaEn: haceMin(5) });
  ctx.lugarDAO.agregar({ nombre: 'Mercado Lejos', categoria: 'MERCADO', ...alNorte(4), saturacionActual: NivelSaturacion.MODERADO, saturacionActualizadaEn: haceMin(300) });
  ctx.lugarDAO.agregar({ nombre: 'Plaza Borde', categoria: 'PLAZA', ...alNorte(2.01) });
});

describe('GET /api/lugares/explorar: acceso', () => {
  it('sin token responde 401 NO_AUTENTICADO', async () => {
    const res = await request(app).get('/api/lugares/explorar');
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('NO_AUTENTICADO');
  });

  it('no lo captura /lugares/:id (S39): responde 200 y no LUGAR_NO_ENCONTRADO ni 400 de id', async () => {
    expect((await explorar()).status).toBe(200);
  });
});

describe('explorar: tabla de decision lat / lng / radioKm', () => {
  it('R1 sin coordenadas: 200, todos por nombre y distanciaMetros null', async () => {
    const res = await explorar();
    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Lugares obtenidos correctamente.');
    expect(nombres(res)).toEqual(['Mercado Lejos', 'Parque Cerca', 'Parque Medio', 'Plaza Borde']);
    expect(res.body.data.items.every((i: { distanciaMetros: unknown }) => i.distanciaMetros === null)).toBe(true);
  });

  it('R2 solo lat: 400 VALIDACION_FALLIDA en lng (S38)', async () => {
    const res = await explorar(`?lat=${CENTRO.lat}`);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDACION_FALLIDA');
    expect(res.body.errors.map((e: { campo: string }) => e.campo)).toContain('lng');
  });

  it('R3 solo lng: 400 VALIDACION_FALLIDA en lat', async () => {
    const res = await explorar(`?lng=${CENTRO.lng}`);
    expect(res.status).toBe(400);
    expect(res.body.errors.map((e: { campo: string }) => e.campo)).toContain('lat');
  });

  it('R4 ambas: 200 ordenado por distancia, con distanciaMetros y radio por defecto de 2 km', async () => {
    const res = await explorar(`?${POS}`);
    expect(res.status).toBe(200);
    expect(nombres(res)).toEqual(['Parque Cerca', 'Parque Medio']);
    expect(res.body.data.items[0]).toEqual({
      id: expect.any(Number),
      nombre: 'Parque Cerca',
      categoria: 'PARQUE',
      latitud: expect.any(Number),
      longitud: CENTRO.lng,
      saturacion: 'TRANQUILO',
      distanciaMetros: expect.closeTo(300, -1),
    });
  });

  it('R5 solo radioKm: se ignora y lista por nombre', async () => {
    const res = await explorar('?radioKm=0.5');
    expect(res.status).toBe(200);
    expect(nombres(res)).toHaveLength(4);
  });

  it.each(['0.09', '20.1', 'abc', '-1', ''])('R6 radioKm=%s con coordenadas: 400', async (radio) => {
    const res = await explorar(`?${POS}&radioKm=${radio}`);
    expect(res.status).toBe(400);
    expect(res.body.errors.map((e: { campo: string }) => e.campo)).toContain('radioKm');
  });
});

describe('explorar: radioKm (valores limite)', () => {
  it('0.1 km: solo lo que esta a 100 m o menos', async () => {
    expect(nombres(await explorar(`?${POS}&radioKm=0.1`))).toEqual([]);
  });

  it('el radio incluye hasta su limite: 1.5 km deja a Parque Medio dentro (S37)', async () => {
    expect(nombres(await explorar(`?${POS}&radioKm=1.6`))).toEqual(['Parque Cerca', 'Parque Medio']);
  });

  it('2 km excluye al lugar de 2.01 km y 2.1 km lo incluye (S37)', async () => {
    expect(nombres(await explorar(`?${POS}&radioKm=2`))).not.toContain('Plaza Borde');
    expect(nombres(await explorar(`?${POS}&radioKm=2.1`))).toContain('Plaza Borde');
  });

  it('20 km es valido y alcanza a todos', async () => {
    const res = await explorar(`?${POS}&radioKm=20`);
    expect(res.status).toBe(200);
    expect(nombres(res)).toHaveLength(4);
  });
});

describe('explorar: lat y lng (valores limite)', () => {
  it.each([
    ['lat=90&lng=0', 200],
    ['lat=-90&lng=0', 200],
    ['lat=90.0001&lng=0', 400],
    ['lat=-90.0001&lng=0', 400],
    ['lat=0&lng=180', 200],
    ['lat=0&lng=-180', 200],
    ['lat=0&lng=180.0001', 400],
    ['lat=0&lng=-180.0001', 400],
    ['lat=abc&lng=0', 400],
    ['lat=0&lng=1e3', 400],
  ])('%s -> %i', async (consulta, estado) => {
    expect((await explorar(`?${consulta}`)).status).toBe(estado);
  });
});

describe('explorar: categoria (S30, S31)', () => {
  it('PARQUE devuelve solo parques y MERCADO solo mercados', async () => {
    expect(nombres(await explorar('?categoria=PARQUE'))).toEqual(['Parque Cerca', 'Parque Medio']);
    expect(nombres(await explorar('?categoria=MERCADO'))).toEqual(['Mercado Lejos']);
  });

  it.each(['parque', 'CINE', ''])('categoria=%s no existe: 400', async (categoria) => {
    const res = await explorar(`?categoria=${categoria}`);
    expect(res.status).toBe(400);
    expect(res.body.errors.map((e: { campo: string }) => e.campo)).toContain('categoria');
  });

  it('una categoria sin lugares responde 200, lista vacia y el mensaje de HU 3.5 c3 (S32)', async () => {
    const res = await explorar('?categoria=PLAYA');
    expect(res.status).toBe(200);
    expect(res.body.data.items).toEqual([]);
    expect(res.body.message).toBe('No hay lugares cercanos disponibles para esa categoría.');
  });
});

describe('explorar: saturacion, nivel efectivo (S33-S35)', () => {
  it.each([
    ['TRANQUILO', ['Parque Cerca']],
    ['SATURADO', ['Parque Medio']],
    ['MODERADO', []],
    ['SIN_INFORMACION', ['Mercado Lejos', 'Plaza Borde']],
  ])('saturacion=%s', async (nivel, esperado) => {
    expect(nombres(await explorar(`?saturacion=${nivel}`))).toEqual(esperado);
  });

  it.each(['tranquilo', 'LLENO', ''])('saturacion=%s no existe: 400', async (nivel) => {
    const res = await explorar(`?saturacion=${nivel}`);
    expect(res.status).toBe(400);
    expect(res.body.errors.map((e: { campo: string }) => e.campo)).toContain('saturacion');
  });

  it('sin resultados explica el nivel buscado (HU 3.6 c3)', async () => {
    const res = await explorar('?saturacion=MODERADO');
    expect(res.status).toBe(200);
    expect(res.body.message).toBe('No hay lugares cercanos con ese nivel de saturación.');
  });
});

describe('explorar: combinaciones (S36)', () => {
  it('categoria + saturacion + coordenadas se combinan con AND', async () => {
    expect(nombres(await explorar(`?categoria=PARQUE&saturacion=SATURADO&${POS}&radioKm=2`))).toEqual(['Parque Medio']);
  });

  it('sin resultados con dos filtros usa el mensaje general', async () => {
    const res = await explorar('?categoria=MERCADO&saturacion=TRANQUILO');
    expect(res.body.data.items).toEqual([]);
    expect(res.body.message).toBe('No hay lugares cercanos que cumplan con los filtros seleccionados.');
  });

  it('sin resultados solo por radio usa el mensaje general', async () => {
    const res = await explorar('?lat=0&lng=0');
    expect(res.body.message).toBe('No hay lugares cercanos que cumplan con los filtros seleccionados.');
  });
});

describe('explorar: limite (valores limite)', () => {
  it.each([
    ['1', 200, 1],
    ['4', 200, 4],
    ['200', 200, 4],
    ['0', 400, 0],
    ['201', 400, 0],
    ['x', 400, 0],
  ])('limite=%s -> %i', async (limite, estado, cantidad) => {
    const res = await explorar(`?limite=${limite}`);
    expect(res.status).toBe(estado);
    if (estado === 200) expect(res.body.data.items).toHaveLength(cantidad);
  });
});

describe('GET /api/lugares/categorias', () => {
  it('sin token responde 401', async () => {
    expect((await request(app).get('/api/lugares/categorias')).status).toBe(401);
  });

  it('lista las 6 categorias con etiqueta y total, 0 incluido', async () => {
    const res = await request(app).get('/api/lugares/categorias').set('Authorization', TOKEN);
    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Categorías obtenidas correctamente.');
    expect(res.body.data.items).toEqual([
      { categoria: 'PARQUE', etiqueta: 'Parques', total: 2 },
      { categoria: 'CENTRO_COMERCIAL', etiqueta: 'Centros comerciales', total: 0 },
      { categoria: 'MERCADO', etiqueta: 'Mercados', total: 1 },
      { categoria: 'TRANSPORTE', etiqueta: 'Transporte', total: 0 },
      { categoria: 'PLAZA', etiqueta: 'Plazas', total: 1 },
      { categoria: 'PLAYA', etiqueta: 'Playas', total: 0 },
    ]);
  });
});
