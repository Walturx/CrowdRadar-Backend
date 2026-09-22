/** container/lugar.ts: builds LugarService from the shared infrastructure, with the other streams' ports replaceable. */
import { describe, expect, it } from 'vitest';
import { crearLugarService, type DependenciasLugar } from '../../src/container/lugar.js';
import { construirInfraestructura } from '../../src/container/infraestructura.js';
import { NivelSaturacion } from '../../src/enum/NivelSaturacion.js';
import { EmisorTokenFalso } from '../support/adapter/EmisorTokenFalso.js';
import { HasherFalso } from '../support/adapter/HasherFalso.js';
import { FavoritoDAOMemoria } from '../support/dao/memoria/FavoritoDAOMemoria.js';
import { LugarDAOMemoria } from '../support/dao/memoria/LugarDAOMemoria.js';
import { UsuarioDAOMemoria } from '../support/dao/memoria/UsuarioDAOMemoria.js';
import { ConexionFalsa } from '../support/ConexionFalsa.js';
import { configPrueba } from '../support/configPrueba.js';
import { crearLoggerSilencioso } from '../support/LoggerSilencioso.js';

const infra = (lugar?: Partial<DependenciasLugar>) =>
  construirInfraestructura({
    cfg: configPrueba({ SATURACION_VENTANA_MIN: 30 }),
    logger: crearLoggerSilencioso(),
    conexion: new ConexionFalsa(),
    usuarioDAO: new UsuarioDAOMemoria(),
    hasher: new HasherFalso(),
    emisorToken: new EmisorTokenFalso(),
    lugar,
  });

describe('crearLugarService', () => {
  it('usa los puertos inyectados y los marcadores de M3 y M4 para lo que falta', async () => {
    const lugarDAO = new LugarDAOMemoria();
    const lugar = lugarDAO.agregar({ nombre: 'Parque Kennedy' });
    const servicio = crearLugarService(infra({ lugarDAO }));
    const detalle = await servicio.obtenerDetalle(lugar.id, 1);
    expect(detalle).toMatchObject({ reportesRecientes: 0, esFavorito: false, alertasActivadas: false });
    expect(detalle.lugar.nombre).toBe('Parque Kennedy');
  });

  it('usa el FavoritoDAO inyectado cuando existe', async () => {
    const lugarDAO = new LugarDAOMemoria();
    const favoritoDAO = new FavoritoDAOMemoria();
    const lugar = lugarDAO.agregar();
    await favoritoDAO.crear(1, lugar.id);
    const detalle = await crearLugarService(infra({ lugarDAO, favoritoDAO })).obtenerDetalle(lugar.id, 1);
    expect(detalle.esFavorito).toBe(true);
  });

  it('toma la ventana de saturacion de la configuracion (30 min)', async () => {
    const lugarDAO = new LugarDAOMemoria();
    const lugar = lugarDAO.agregar({ saturacionActual: NivelSaturacion.SATURADO, saturacionActualizadaEn: new Date(Date.now() - 45 * 60_000) });
    const detalle = await crearLugarService(infra({ lugarDAO })).obtenerDetalle(lugar.id, 1);
    expect(detalle.nivel).toBe('SIN_INFORMACION');
  });
});
