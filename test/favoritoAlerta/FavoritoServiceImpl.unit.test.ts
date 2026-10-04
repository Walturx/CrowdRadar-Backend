/**
 * Integrante: stream M3 (favoritos y alertas)
 * Tecnica: caja negra (particiones de equivalencia: lugar existente, inexistente, ya favorito, ajeno; nivel vigente, vencido, nulo)
 * Metodo: FavoritoServiceImpl.agregar / listar / eliminar / configurarAlertas (spec M3 R1-R4, S1-S3, S5, S7-S9, S11-S14)
 */
import { describe, expect, it } from 'vitest';
import { NivelEfectivo, NivelSaturacion } from '../../src/enum/NivelSaturacion.js';
import { CodigoError } from '../../src/exception/CodigoError.js';
import { FavoritoDuplicadoException } from '../../src/exception/favorito/FavoritoDuplicadoException.js';
import { FavoritoNoEncontradoException } from '../../src/exception/favorito/FavoritoNoEncontradoException.js';
import { LugarNoEncontradoException } from '../../src/exception/lugar/LugarNoEncontradoException.js';
import { FavoritoServiceImpl } from '../../src/service/impl/FavoritoServiceImpl.js';
import { RelojFijo } from '../support/RelojFijo.js';
import { FavoritoDAOMemoria } from '../support/dao/memoria/FavoritoDAOMemoria.js';
import { LugarDAOMemoria } from '../support/dao/memoria/LugarDAOMemoria.js';

const AHORA = new Date('2026-10-05T14:00:00Z');
const haceMin = (min: number) => new Date(AHORA.getTime() - min * 60_000);

function armar() {
  const lugarDAO = new LugarDAOMemoria();
  const favoritoDAO = new FavoritoDAOMemoria();
  const service = new FavoritoServiceImpl({
    favoritoDAO,
    lugarDAO,
    reloj: new RelojFijo(AHORA),
    ventanaSaturacionMin: 60,
  });
  return { lugarDAO, favoritoDAO, service };
}

describe('FavoritoServiceImpl.agregar', () => {
  it('guarda el favorito con las alertas activadas y devuelve el lugar con su nivel efectivo (S1)', async () => {
    const { lugarDAO, favoritoDAO, service } = armar();
    const lugar = lugarDAO.agregar({ nombre: 'Parque Kennedy', saturacionActual: NivelSaturacion.MODERADO, saturacionActualizadaEn: haceMin(5) });
    const creado = await service.agregar(1, lugar.id);
    expect(creado.favorito).toMatchObject({ usuarioId: 1, lugarId: lugar.id, alertasActivadas: true });
    expect(creado.lugar.nombre).toBe('Parque Kennedy');
    expect(creado.nivel).toBe(NivelSaturacion.MODERADO);
    expect(await favoritoDAO.buscar(1, lugar.id)).not.toBeNull();
  });

  it('un lugar que ya es favorito del usuario lanza FavoritoDuplicadoException 409 y deja una sola fila (S2)', async () => {
    const { lugarDAO, favoritoDAO, service } = armar();
    const lugar = lugarDAO.agregar();
    await service.agregar(1, lugar.id);
    const error = await service.agregar(1, lugar.id).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(FavoritoDuplicadoException);
    expect(error).toMatchObject({ status: 409, code: CodigoError.FAVORITO_DUPLICADO, message: 'Este lugar ya pertenece a tus favoritos.' });
    expect(await favoritoDAO.listarPorUsuario(1)).toHaveLength(1);
  });

  it('el mismo lugar puede ser favorito de otro usuario', async () => {
    const { lugarDAO, service } = armar();
    const lugar = lugarDAO.agregar();
    await service.agregar(1, lugar.id);
    await expect(service.agregar(2, lugar.id)).resolves.toMatchObject({ favorito: { usuarioId: 2 } });
  });

  it('un lugar inexistente lanza LugarNoEncontradoException y no crea fila (S3)', async () => {
    const { favoritoDAO, service } = armar();
    await expect(service.agregar(1, 999)).rejects.toBeInstanceOf(LugarNoEncontradoException);
    expect(await favoritoDAO.listarPorUsuario(1)).toEqual([]);
  });
});

describe('FavoritoServiceImpl.listar', () => {
  it('muestra el nivel efectivo: vigente se conserva, vencido o nulo es SIN_INFORMACION (S7)', async () => {
    const { lugarDAO, service } = armar();
    const fresco = lugarDAO.agregar({ saturacionActual: NivelSaturacion.MODERADO, saturacionActualizadaEn: haceMin(10) });
    const viejo = lugarDAO.agregar({ saturacionActual: NivelSaturacion.SATURADO, saturacionActualizadaEn: haceMin(90) });
    const nulo = lugarDAO.agregar();
    for (const lugar of [fresco, viejo, nulo]) await service.agregar(1, lugar.id);
    const lista = await service.listar(1);
    expect(lista.map((f) => [f.lugar.id, f.nivel])).toEqual([
      [nulo.id, NivelEfectivo.SIN_INFORMACION],
      [viejo.id, NivelEfectivo.SIN_INFORMACION],
      [fresco.id, NivelSaturacion.MODERADO],
    ]);
  });

  it('un nivel justo en el limite de la ventana sigue vigente (BVA 60 min)', async () => {
    const { lugarDAO, service } = armar();
    const lugar = lugarDAO.agregar({ saturacionActual: NivelSaturacion.TRANQUILO, saturacionActualizadaEn: haceMin(60) });
    await service.agregar(1, lugar.id);
    expect((await service.listar(1))[0]?.nivel).toBe(NivelSaturacion.TRANQUILO);
  });

  it('solo devuelve los favoritos del usuario, el mas nuevo primero (S8)', async () => {
    const { lugarDAO, service } = armar();
    const a = lugarDAO.agregar();
    const b = lugarDAO.agregar();
    await service.agregar(1, a.id);
    await service.agregar(2, b.id);
    await service.agregar(1, b.id);
    expect((await service.listar(1)).map((f) => f.lugar.id)).toEqual([b.id, a.id]);
    expect(await service.listar(3)).toEqual([]);
  });
});

describe('FavoritoServiceImpl.eliminar', () => {
  it('borra el favorito propio y la lista ya no lo muestra (S9)', async () => {
    const { lugarDAO, service } = armar();
    const lugar = lugarDAO.agregar();
    await service.agregar(1, lugar.id);
    await expect(service.eliminar(1, lugar.id)).resolves.toBeUndefined();
    expect(await service.listar(1)).toEqual([]);
  });

  it('lo que no es favorito del usuario lanza FavoritoNoEncontradoException 404: segunda baja y favorito ajeno (S12, S13)', async () => {
    const { lugarDAO, service } = armar();
    const lugar = lugarDAO.agregar();
    await service.agregar(2, lugar.id);
    const error = await service.eliminar(1, lugar.id).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(FavoritoNoEncontradoException);
    expect(error).toMatchObject({ status: 404, code: CodigoError.FAVORITO_NO_ENCONTRADO });
    await service.eliminar(2, lugar.id);
    await expect(service.eliminar(2, lugar.id)).rejects.toBeInstanceOf(FavoritoNoEncontradoException);
  });
});

describe('FavoritoServiceImpl.configurarAlertas', () => {
  it('apaga y vuelve a encender las alertas, de forma idempotente (S14)', async () => {
    const { lugarDAO, service } = armar();
    const lugar = lugarDAO.agregar();
    await service.agregar(1, lugar.id);
    expect((await service.configurarAlertas(1, lugar.id, false)).favorito.alertasActivadas).toBe(false);
    expect((await service.configurarAlertas(1, lugar.id, false)).favorito.alertasActivadas).toBe(false);
    expect((await service.configurarAlertas(1, lugar.id, true)).favorito.alertasActivadas).toBe(true);
  });

  it('un lugar que no es favorito del usuario lanza FavoritoNoEncontradoException 404', async () => {
    const { lugarDAO, service } = armar();
    const lugar = lugarDAO.agregar();
    await expect(service.configurarAlertas(1, lugar.id, true)).rejects.toBeInstanceOf(FavoritoNoEncontradoException);
    await expect(service.configurarAlertas(1, 999, true)).rejects.toBeInstanceOf(FavoritoNoEncontradoException);
  });
});
