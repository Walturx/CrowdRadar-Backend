/**
 * Integrante: M2 (lugares y busqueda)
 * Tecnica: prueba unitaria con DAOs en memoria y reloj fijo
 * Metodo: LugarServiceImpl.obtenerDetalle (y buscar)
 * Casos: saturacion vigente, vencida -> SIN_INFORMACION (y el borde de la ventana), sin lectura, favorito con
 * alertas, favorito sin alertas, no favorito, lugar inexistente -> 404, abiertoAhora, reportes recientes
 * por el puerto ReporteDAO, busqueda delegada con nivel efectivo por fila.
 */
import { describe, expect, it, vi } from 'vitest';
import type { ReporteDAO } from '../../src/dao/ReporteDAO.js';
import { CategoriaLugar } from '../../src/enum/CategoriaLugar.js';
import { NivelEfectivo, NivelSaturacion } from '../../src/enum/NivelSaturacion.js';
import { CodigoError } from '../../src/exception/CodigoError.js';
import { LugarNoEncontradoException } from '../../src/exception/lugar/LugarNoEncontradoException.js';
import { LugarServiceImpl } from '../../src/service/impl/LugarServiceImpl.js';
import { FavoritoDAOMemoria } from '../support/dao/memoria/FavoritoDAOMemoria.js';
import { LugarDAOMemoria } from '../support/dao/memoria/LugarDAOMemoria.js';
import { RelojFijo } from '../support/RelojFijo.js';

const AHORA = new Date('2026-10-05T15:00:00Z'); // 10:00 in Lima
const VENTANA_MIN = 60;
const ZONA = 'America/Lima';
const haceMin = (min: number) => new Date(AHORA.getTime() - min * 60_000);
const USUARIO = 7;

function crearServicio(reportesRecientes = 0) {
  const lugarDAO = new LugarDAOMemoria();
  const favoritoDAO = new FavoritoDAOMemoria();
  const contarPorLugarDesde = vi.fn(async () => reportesRecientes);
  const reporteDAO: Pick<ReporteDAO, 'contarPorLugarDesde'> = { contarPorLugarDesde };
  const servicio = new LugarServiceImpl({
    lugarDAO,
    favoritoDAO,
    reporteDAO,
    reloj: new RelojFijo(AHORA),
    ventanaSaturacionMin: VENTANA_MIN,
    zonaHoraria: ZONA,
  });
  return { servicio, lugarDAO, favoritoDAO, contarPorLugarDesde };
}

describe('LugarServiceImpl.obtenerDetalle', () => {
  it('saturacion vigente: conserva el nivel guardado y cuenta los reportes de la ventana', async () => {
    const { servicio, lugarDAO, contarPorLugarDesde } = crearServicio(4);
    const lugar = lugarDAO.agregar({ saturacionActual: NivelSaturacion.MODERADO, saturacionActualizadaEn: haceMin(5) });
    const detalle = await servicio.obtenerDetalle(lugar.id, USUARIO);
    expect(detalle.nivel).toBe(NivelEfectivo.MODERADO);
    expect(detalle.reportesRecientes).toBe(4);
    expect(contarPorLugarDesde).toHaveBeenCalledWith(lugar.id, haceMin(VENTANA_MIN));
    expect(detalle.lugar.id).toBe(lugar.id);
  });

  it('saturacion vencida (90 min con ventana de 60): SIN_INFORMACION', async () => {
    const { servicio, lugarDAO } = crearServicio();
    const lugar = lugarDAO.agregar({ saturacionActual: NivelSaturacion.SATURADO, saturacionActualizadaEn: haceMin(90) });
    expect((await servicio.obtenerDetalle(lugar.id, USUARIO)).nivel).toBe(NivelEfectivo.SIN_INFORMACION);
  });

  it.each([
    [60, NivelEfectivo.SATURADO],
    [61, NivelEfectivo.SIN_INFORMACION],
  ])('borde de la ventana: lectura de hace %i min -> %s', async (minutos, esperado) => {
    const { servicio, lugarDAO } = crearServicio();
    const lugar = lugarDAO.agregar({ saturacionActual: NivelSaturacion.SATURADO, saturacionActualizadaEn: haceMin(minutos) });
    expect((await servicio.obtenerDetalle(lugar.id, USUARIO)).nivel).toBe(esperado);
  });

  it('sin lectura (NULL): SIN_INFORMACION', async () => {
    const { servicio, lugarDAO } = crearServicio();
    const lugar = lugarDAO.agregar({ saturacionActual: null });
    expect((await servicio.obtenerDetalle(lugar.id, USUARIO)).nivel).toBe(NivelEfectivo.SIN_INFORMACION);
  });

  it('favorito con alertas activadas', async () => {
    const { servicio, lugarDAO, favoritoDAO } = crearServicio();
    const lugar = lugarDAO.agregar();
    await favoritoDAO.crear(USUARIO, lugar.id);
    const detalle = await servicio.obtenerDetalle(lugar.id, USUARIO);
    expect([detalle.esFavorito, detalle.alertasActivadas]).toEqual([true, true]);
  });

  it('favorito con las alertas apagadas, y lugar que el usuario no guardo', async () => {
    const { servicio, lugarDAO, favoritoDAO } = crearServicio();
    const lugar = lugarDAO.agregar();
    await favoritoDAO.crear(USUARIO, lugar.id);
    await favoritoDAO.actualizarAlertas(USUARIO, lugar.id, false);
    const apagado = await servicio.obtenerDetalle(lugar.id, USUARIO);
    expect([apagado.esFavorito, apagado.alertasActivadas]).toEqual([true, false]);
    const ajeno = await servicio.obtenerDetalle(lugar.id, USUARIO + 1);
    expect([ajeno.esFavorito, ajeno.alertasActivadas]).toEqual([false, false]);
  });

  it('lugar inexistente: LugarNoEncontradoException (404 LUGAR_NO_ENCONTRADO)', async () => {
    const { servicio } = crearServicio();
    const error = await servicio.obtenerDetalle(999, USUARIO).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(LugarNoEncontradoException);
    expect(error).toMatchObject({ status: 404, code: CodigoError.LUGAR_NO_ENCONTRADO });
  });

  it('abiertoAhora usa la hora local de la zona configurada; sin horas es null', async () => {
    const { servicio, lugarDAO } = crearServicio();
    const abierto = lugarDAO.agregar({ horaApertura: 8, horaCierre: 20 });
    const cerrado = lugarDAO.agregar({ horaApertura: 11, horaCierre: 20 });
    const sinHoras = lugarDAO.agregar({ horaApertura: null, horaCierre: null });
    expect((await servicio.obtenerDetalle(abierto.id, USUARIO)).abiertoAhora).toBe(true);
    expect((await servicio.obtenerDetalle(cerrado.id, USUARIO)).abiertoAhora).toBe(false);
    expect((await servicio.obtenerDetalle(sinHoras.id, USUARIO)).abiertoAhora).toBeNull();
  });
});

describe('LugarServiceImpl.buscar', () => {
  it('delega el criterio al DAO y deriva el nivel efectivo de cada fila', async () => {
    const { servicio, lugarDAO } = crearServicio();
    lugarDAO.agregar({ nombre: 'Parque A', saturacionActual: NivelSaturacion.TRANQUILO, saturacionActualizadaEn: haceMin(10) });
    lugarDAO.agregar({ nombre: 'Parque B', saturacionActual: NivelSaturacion.SATURADO, saturacionActualizadaEn: haceMin(120) });
    lugarDAO.agregar({ nombre: 'Parque C' });
    const resultados = await servicio.buscar({ q: 'parque', limite: 10 });
    expect(resultados.map((r) => [r.lugar.nombre, r.nivel])).toEqual([
      ['Parque A', 'TRANQUILO'],
      ['Parque B', 'SIN_INFORMACION'],
      ['Parque C', 'SIN_INFORMACION'],
    ]);
  });

  it('pasa q, bbox, categoria, nivel, limite y el inicio de la ventana al DAO', async () => {
    const { servicio, lugarDAO } = crearServicio();
    const espia = vi.spyOn(lugarDAO, 'buscar');
    const bbox = { minLng: -77.1, minLat: -12.2, maxLng: -77.0, maxLat: -12.0 };
    await servicio.buscar({ q: 'kennedy', bbox, categoria: CategoriaLugar.PLAZA, nivel: NivelEfectivo.MODERADO, limite: 25 });
    expect(espia).toHaveBeenCalledWith({
      q: 'kennedy',
      bbox,
      categoria: CategoriaLugar.PLAZA,
      nivel: NivelEfectivo.MODERADO,
      vigenteDesde: haceMin(VENTANA_MIN),
      limite: 25,
    });
  });

  it('el filtro por nivel SIN_INFORMACION incluye los vencidos', async () => {
    const { servicio, lugarDAO } = crearServicio();
    lugarDAO.agregar({ nombre: 'Vencido', saturacionActual: NivelSaturacion.SATURADO, saturacionActualizadaEn: haceMin(90) });
    lugarDAO.agregar({ nombre: 'Fresco', saturacionActual: NivelSaturacion.SATURADO, saturacionActualizadaEn: haceMin(5) });
    const sinInfo = await servicio.buscar({ nivel: NivelEfectivo.SIN_INFORMACION, limite: 10 });
    expect(sinInfo.map((r) => r.lugar.nombre)).toEqual(['Vencido']);
    const saturados = await servicio.buscar({ nivel: NivelEfectivo.SATURADO, limite: 10 });
    expect(saturados.map((r) => r.lugar.nombre)).toEqual(['Fresco']);
  });
});
