/** LugarMapper: the only place that shapes a Lugar for HTTP (spec M2 R1-R3, D-4: `saturacion` is a string on the list, an object on the detail). */
import { describe, expect, it } from 'vitest';
import { NivelEfectivo } from '../../src/enum/NivelSaturacion.js';
import { CategoriaLugar } from '../../src/enum/CategoriaLugar.js';
import { LugarMapper } from '../../src/mapper/LugarMapper.js';
import type { DetalleLugar } from '../../src/service/LugarService.js';
import { aLugar } from '../support/fabrica/datos.js';

const ACTUALIZADA = new Date('2026-10-05T14:55:00Z');

const detalle = (parcial: Partial<DetalleLugar> = {}): DetalleLugar => ({
  lugar: aLugar({ id: 3, nombre: 'Parque Kennedy', direccion: 'Miraflores, Lima', horarioAtencion: '06:00-22:00', urlFoto: 'http://x/y.jpg', saturacionActualizadaEn: ACTUALIZADA }),
  nivel: NivelEfectivo.MODERADO,
  reportesRecientes: 3,
  abiertoAhora: true,
  esFavorito: true,
  alertasActivadas: false,
  ...parcial,
});

describe('LugarMapper.aResumen', () => {
  it('lista solo los campos publicos y la saturacion como texto', () => {
    const lugar = aLugar({ id: 9, nombre: 'Playa X', categoria: CategoriaLugar.PLAYA, latitud: -12.13, longitud: -77.03, direccion: 'oculta', saturacionActual: 'SATURADO' });
    expect(LugarMapper.aResumen({ lugar, nivel: NivelEfectivo.SATURADO })).toEqual({
      id: 9,
      nombre: 'Playa X',
      categoria: 'PLAYA',
      latitud: -12.13,
      longitud: -77.03,
      saturacion: 'SATURADO',
    });
  });

  it('un nivel efectivo SIN_INFORMACION se publica aunque el lugar guarde otro nivel', () => {
    const lugar = aLugar({ saturacionActual: 'SATURADO' });
    expect(LugarMapper.aResumen({ lugar, nivel: NivelEfectivo.SIN_INFORMACION }).saturacion).toBe('SIN_INFORMACION');
  });
});

describe('LugarMapper.aDetalle', () => {
  it('arma el detalle con la saturacion como objeto', () => {
    expect(LugarMapper.aDetalle(detalle())).toEqual({
      id: 3,
      nombre: 'Parque Kennedy',
      direccion: 'Miraflores, Lima',
      categoria: 'PARQUE',
      latitud: -12.12,
      longitud: -77.03,
      horarioAtencion: '06:00-22:00',
      abiertoAhora: true,
      urlFoto: 'http://x/y.jpg',
      saturacion: { nivel: 'MODERADO', actualizadoEn: '2026-10-05T14:55:00.000Z', reportesRecientes: 3, mensaje: null },
      esFavorito: true,
      alertasActivadas: false,
    });
  });

  it('SIN_INFORMACION: sin fecha y con el mensaje explicativo', () => {
    const { saturacion } = LugarMapper.aDetalle(detalle({ nivel: NivelEfectivo.SIN_INFORMACION, reportesRecientes: 0 }));
    expect(saturacion).toEqual({
      nivel: 'SIN_INFORMACION',
      actualizadoEn: null,
      reportesRecientes: 0,
      mensaje: 'Aún no hay reportes suficientes para determinar la saturación de este lugar.',
    });
  });

  it('conserva los nulos: direccion, horario, foto y abiertoAhora desconocido', () => {
    const dto = LugarMapper.aDetalle(detalle({ abiertoAhora: null, lugar: aLugar({ direccion: null, horarioAtencion: null, urlFoto: null }) }));
    expect([dto.direccion, dto.horarioAtencion, dto.urlFoto, dto.abiertoAhora]).toEqual([null, null, null, null]);
  });
});

describe('LugarMapper.mensajeLista', () => {
  const resultado = { lugar: aLugar(), nivel: NivelEfectivo.TRANQUILO };

  it('con resultados confirma la consulta', () => {
    expect(LugarMapper.mensajeLista([resultado], 'parque')).toBe('Lugares obtenidos correctamente.');
  });

  it('vacia con q: nombra lo buscado', () => {
    expect(LugarMapper.mensajeLista([], 'Zoológico')).toBe('No encontramos lugares para “Zoológico”. Prueba con otro nombre.');
  });

  it('vacia sin q: habla de la zona', () => {
    expect(LugarMapper.mensajeLista([], undefined)).toBe('No hay lugares en esta zona.');
  });
});
