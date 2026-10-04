/**
 * Integrante: M2 (lugares y busqueda)
 * Tecnica: caja negra: particiones de equivalencia + valores limite + tabla de decision
 * Endpoint: GET /api/lugares?q&bbox=minLng,minLat,maxLng,maxLat&categoria&nivel&limite  (5 entradas)
 * Tabla de decision q x bbox: ninguno -> 400 | solo q -> 200 | solo bbox -> 200 | ambos -> 200 (AND)
 * Limites: q de 1 / 2 / 60 / 61 caracteres (ya recortada), latitud -90.1 / -90 / 90 / 90.1, longitud +-180 / 180.1,
 * limite 0 / 1 / 200 / 201, bbox con 3 / 4 / 5 valores, no numerico, minimos >= maximos.
 * Ademas: 200 vacio con mensaje, 401 sin token, 403 cuenta suspendida, los 45 lugares sembrados en un bbox de toda Lima.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { CategoriaLugar } from '../../src/enum/CategoriaLugar.js';
import { EstadoCuenta } from '../../src/enum/EstadoCuenta.js';
import { NivelSaturacion } from '../../src/enum/NivelSaturacion.js';
import type { Lugar } from '../../src/entity/Lugar.js';
import { crearContenedorPrueba } from '../support/crearContenedorPrueba.js';
import { aUsuario } from '../support/fabrica/datos.js';

const SEMILLA: Pick<Lugar, 'osmTipo' | 'osmId' | 'nombre' | 'direccion' | 'latitud' | 'longitud' | 'categoria'>[] = JSON.parse(
  readFileSync(resolve(import.meta.dirname, '..', '..', 'database', 'data', 'lugares-lima.json'), 'utf8'),
);
const MIRAFLORES = '-77.05,-12.14,-77.0,-12.10';
const KENNEDY = '-77.035,-12.125,-77.025,-12.115';
const LIMA_ENTERA = '-77.2,-12.25,-76.85,-11.85';
const OCEANO = '-78.5,-13.0,-78.0,-12.5';

const ctx = crearContenedorPrueba();
const app = createApp(ctx.contenedor);
const usuario = ctx.usuarioDAO.agregar(aUsuario({ email: 'bb@crowdradar.pe' }));
const TOKEN = `Bearer ${ctx.emisorToken.emitir(usuario).token}`;

const buscar = (query: Record<string, string | number>) => request(app).get('/api/lugares').query(query).set('Authorization', TOKEN);
const nombres = (res: request.Response) => (res.body.data.items as { nombre: string }[]).map((i) => i.nombre);
const campoInvalido = (res: request.Response, campo: string) => {
  expect(res.status, JSON.stringify(res.body)).toBe(400);
  expect(res.body.code).toBe('VALIDACION_FALLIDA');
  expect((res.body.errors as { campo: string }[]).map((e) => e.campo)).toContain(campo);
};

beforeAll(() => {
  for (const lugar of SEMILLA) ctx.lugarDAO.agregar({ ...lugar });
});

describe('GET /api/lugares: tabla de decision q x bbox', () => {
  it('sin q ni bbox responde 400 VALIDACION_FALLIDA', async () => {
    const res = await buscar({});
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDACION_FALLIDA');
    expect(res.body.errors.length).toBeGreaterThan(0);
  });

  it('solo categoria, nivel o limite tampoco bastan', async () => {
    expect((await buscar({ categoria: 'PARQUE' })).status).toBe(400);
    expect((await buscar({ nivel: 'TRANQUILO', limite: 10 })).status).toBe(400);
  });

  it('solo q: busca por nombre en todo Lima', async () => {
    const res = await buscar({ q: 'plaza' });
    expect(res.status).toBe(200);
    expect(nombres(res)).toEqual(expect.arrayContaining(['Plaza San Martín', 'Plaza Mayor de Lima']));
    expect(nombres(res).every((n) => n.toLowerCase().includes('plaza'))).toBe(true);
  });

  it('solo bbox: devuelve los lugares del area y ninguno de afuera', async () => {
    const res = await buscar({ bbox: MIRAFLORES });
    expect(res.status).toBe(200);
    expect(nombres(res)).toEqual(expect.arrayContaining(['Larcomar', 'Parque John F. Kennedy']));
    expect(nombres(res)).not.toContain('Plaza San Martín');
    for (const item of res.body.data.items) {
      expect(item.latitud).toBeGreaterThanOrEqual(-12.14);
      expect(item.latitud).toBeLessThanOrEqual(-12.1);
      expect(item.longitud).toBeGreaterThanOrEqual(-77.05);
      expect(item.longitud).toBeLessThanOrEqual(-77.0);
    }
  });

  it('q y bbox juntos se combinan con AND', async () => {
    const soloQ = nombres(await buscar({ q: 'parque' }));
    const ambos = nombres(await buscar({ q: 'parque', bbox: KENNEDY }));
    expect(ambos).toEqual(['Parque 7 de Junio', 'Parque John F. Kennedy']);
    expect(soloQ.length).toBeGreaterThan(ambos.length);
  });
});

describe('GET /api/lugares: q (EP + limites)', () => {
  it.each([
    ['1 caracter', 'a'],
    ['vacia', ''],
    ['solo espacios', '   '],
    ['2 caracteres con un espacio (recortada a 1)', 'a '],
    ['61 caracteres', 'x'.repeat(61)],
  ])('%s -> 400 con campo q', async (_caso, q) => {
    campoInvalido(await buscar({ q, bbox: MIRAFLORES }), 'q');
  });

  it.each([
    ['2 caracteres', 'la'],
    ['60 caracteres', 'x'.repeat(60)],
    ['2 caracteres entre espacios', '  la  '],
  ])('%s -> 200', async (_caso, q) => {
    expect((await buscar({ q })).status).toBe(200);
  });

  it('ignora mayusculas y acentos: Párque, PARQUE y parque dan lo mismo', async () => {
    const [a, b, c] = await Promise.all(['Párque', 'PARQUE', 'parque'].map((q) => buscar({ q })));
    expect(nombres(a!).length).toBeGreaterThan(0);
    expect(nombres(a!)).toEqual(nombres(b!));
    expect(nombres(b!)).toEqual(nombres(c!));
  });

  it('el recorte de q da el mismo resultado que la q limpia', async () => {
    expect(nombres(await buscar({ q: '  parque  ' }))).toEqual(nombres(await buscar({ q: 'parque' })));
  });

  it('q repetida (arreglo) -> 400', async () => {
    const res = await request(app).get('/api/lugares?q=ab&q=cd').set('Authorization', TOKEN);
    campoInvalido(res, 'q');
  });
});

describe('GET /api/lugares: bbox (EP + limites)', () => {
  it.each([
    ['3 valores', '-77.05,-12.14,-77.0'],
    ['5 valores', '-77.05,-12.14,-77.0,-12.10,1'],
    ['vacio', ''],
    ['no numerico', '-77.05,abc,-77.0,-12.10'],
    ['valor vacio', '-77.05,,-77.0,-12.10'],
    ['NaN', '-77.05,NaN,-77.0,-12.10'],
    ['Infinity', '-77.05,-12.14,Infinity,-12.10'],
    ['minLat igual a maxLat', '-77.05,-12.10,-77.0,-12.10'],
    ['minLat mayor que maxLat', '-77.05,-12.10,-77.0,-12.14'],
    ['minLng igual a maxLng', '-77.0,-12.14,-77.0,-12.10'],
    ['minLng mayor que maxLng', '-77.0,-12.14,-77.05,-12.10'],
    ['latitud minima -90.1', '-77.05,-90.1,-77.0,-12.10'],
    ['latitud maxima 90.1', '-77.05,-12.14,-77.0,90.1'],
    ['longitud minima -180.1', '-180.1,-12.14,-77.0,-12.10'],
    ['longitud maxima 180.1', '-77.05,-12.14,180.1,-12.10'],
  ])('%s -> 400 con campo bbox', async (_caso, bbox) => {
    campoInvalido(await buscar({ bbox }), 'bbox');
  });

  it.each([
    ['latitud minima -90', '-77.05,-90,-77.0,-12.10'],
    ['latitud maxima 90', '-77.05,-12.14,-77.0,90'],
    ['longitud -180 a 180', '-180,-12.14,180,-12.10'],
    ['espacios alrededor de los valores', ' -77.05 , -12.14 , -77.0 , -12.10 '],
  ])('%s -> 200', async (_caso, bbox) => {
    expect((await buscar({ bbox })).status).toBe(200);
  });

  it('los bordes del bbox son inclusivos', async () => {
    const cerca = SEMILLA.find((l) => l.nombre === 'Larcomar')!;
    const bbox = `${cerca.longitud},${cerca.latitud},${cerca.longitud + 0.001},${cerca.latitud + 0.001}`;
    expect(nombres(await buscar({ bbox }))).toContain('Larcomar');
  });
});

describe('GET /api/lugares: categoria, nivel y limite', () => {
  it.each(Object.values(CategoriaLugar))('categoria=%s filtra y devuelve solo esa categoria', async (categoria) => {
    const res = await buscar({ bbox: LIMA_ENTERA, categoria });
    expect(res.status).toBe(200);
    const esperados = SEMILLA.filter((l) => l.categoria === categoria).length;
    expect(esperados).toBeGreaterThanOrEqual(5);
    expect(res.body.data.items).toHaveLength(esperados);
    expect(res.body.data.items.every((i: { categoria: string }) => i.categoria === categoria)).toBe(true);
  });

  it.each(['X', 'parque', 'PARQUE,PLAZA', ''])('categoria=%j -> 400 con campo categoria', async (categoria) => {
    campoInvalido(await buscar({ bbox: MIRAFLORES, categoria }), 'categoria');
  });

  it('nivel filtra por el nivel efectivo: vigente, vencido y sin lectura', async () => {
    const vigente = ctx.lugarDAO.agregar({ nombre: 'Zona Fresca', latitud: -12.5, longitud: -77.5, saturacionActual: NivelSaturacion.SATURADO, saturacionActualizadaEn: new Date() });
    const vencido = ctx.lugarDAO.agregar({ nombre: 'Zona Vencida', latitud: -12.5, longitud: -77.5, saturacionActual: NivelSaturacion.SATURADO, saturacionActualizadaEn: new Date(Date.now() - 3 * 3_600_000) });
    const bbox = '-77.6,-12.6,-77.4,-12.4';
    const saturados = await buscar({ bbox, nivel: 'SATURADO' });
    expect(saturados.body.data.items).toEqual([expect.objectContaining({ id: vigente.id, saturacion: 'SATURADO' })]);
    const sinInfo = await buscar({ bbox, nivel: 'SIN_INFORMACION' });
    expect(sinInfo.body.data.items).toEqual([expect.objectContaining({ id: vencido.id, saturacion: 'SIN_INFORMACION' })]);
    expect((await buscar({ bbox, nivel: 'TRANQUILO' })).body.data.items).toEqual([]);
  });

  it.each(['X', 'saturado', 'SIN INFORMACION'])('nivel=%j -> 400 con campo nivel', async (nivel) => {
    campoInvalido(await buscar({ bbox: MIRAFLORES, nivel }), 'nivel');
  });

  it.each([
    ['0', 400],
    ['-1', 400],
    ['1.5', 400],
    ['abc', 400],
    ['201', 400],
    ['1', 200],
    ['200', 200],
  ])('limite=%s -> %i', async (limite, estado) => {
    const res = await buscar({ bbox: LIMA_ENTERA, limite });
    expect(res.status).toBe(estado);
    if (estado === 400) campoInvalido(res, 'limite');
  });

  it('limite recorta la lista ordenada por nombre; sin limite devuelve todo (por defecto 200)', async () => {
    const todos = nombres(await buscar({ bbox: LIMA_ENTERA }));
    expect(todos.length).toBeGreaterThanOrEqual(45);
    expect(todos).toEqual([...todos].sort((a, b) => a.localeCompare(b)));
    const dos = nombres(await buscar({ bbox: LIMA_ENTERA, limite: 2 }));
    expect(dos).toEqual(todos.slice(0, 2));
  });
});

describe('GET /api/lugares: respuesta', () => {
  it('200 con message, items ordenados y solo los campos del resumen', async () => {
    const res = await buscar({ q: 'larcomar' });
    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Lugares obtenidos correctamente.');
    expect(res.body.data.items).toEqual([
      {
        id: expect.any(Number),
        nombre: 'Larcomar',
        categoria: 'CENTRO_COMERCIAL',
        latitud: -12.132219,
        longitud: -77.030549,
        saturacion: 'SIN_INFORMACION',
      },
    ]);
  });

  it('bbox sobre el oceano: 200 con items [] y el mensaje de zona vacia', async () => {
    const res = await buscar({ bbox: OCEANO });
    expect(res.status).toBe(200);
    expect(res.body.data.items).toEqual([]);
    expect(res.body.message).toBe('No hay lugares en esta zona.');
  });

  it('q sin coincidencias: 200 con items [] y el mensaje que nombra lo buscado', async () => {
    const res = await buscar({ q: 'Zoológico' });
    expect(res.status).toBe(200);
    expect(res.body.data.items).toEqual([]);
    expect(res.body.message).toBe('No encontramos lugares para “Zoológico”. Prueba con otro nombre.');
  });

  it('los 45 lugares sembrados salen todos en un bbox de toda Lima (sin asertar tiempos: eso va en la suite con BD)', async () => {
    const res = await buscar({ bbox: LIMA_ENTERA });
    expect(res.body.data.items.length).toBeGreaterThanOrEqual(45);
  });
});

describe('GET /api/lugares: acceso', () => {
  it('sin token -> 401 NO_AUTENTICADO', async () => {
    const res = await request(app).get('/api/lugares').query({ bbox: MIRAFLORES });
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('NO_AUTENTICADO');
  });

  it('cuenta suspendida -> 403 CUENTA_SUSPENDIDA', async () => {
    const suspendido = ctx.usuarioDAO.agregar(aUsuario({ email: 'sus@crowdradar.pe', status: EstadoCuenta.SUSPENDIDO }));
    const token = `Bearer ${ctx.emisorToken.emitir(suspendido).token}`;
    const res = await request(app).get('/api/lugares').query({ bbox: MIRAFLORES }).set('Authorization', token);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('CUENTA_SUSPENDIDA');
  });
});
