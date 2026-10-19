/**
 * Composition root split per stream (design section 10): every builder returns the routers it
 * owns, `ensamblar` mounts them in the frozen order. Builders are the only place a stream changes.
 */
import { describe, expect, it } from 'vitest';
import { construirFavoritoAlerta } from '../../src/container/favoritoAlerta.js';
import { crearContenedor, ensamblar } from '../../src/container/index.js';
import { construirInfraestructura } from '../../src/container/infraestructura.js';
import { construirLugar } from '../../src/container/lugar.js';
import { construirModeracion } from '../../src/container/moderacion.js';
import { construirReporte } from '../../src/container/reporte.js';
import { construirSeguridad } from '../../src/container/seguridad.js';
import { construirValidacion } from '../../src/container/validacion.js';
import { EmisorTokenFalso } from '../support/adapter/EmisorTokenFalso.js';
import { HasherFalso } from '../support/adapter/HasherFalso.js';
import { DenunciaDAOMemoria } from '../support/dao/memoria/DenunciaDAOMemoria.js';
import { ValidacionDAOMemoria } from '../support/dao/memoria/ValidacionDAOMemoria.js';
import { LugarDAOMemoria } from '../support/dao/memoria/LugarDAOMemoria.js';
import { ReporteDAOMemoria } from '../support/dao/memoria/ReporteDAOMemoria.js';
import { UsuarioDAOMemoria } from '../support/dao/memoria/UsuarioDAOMemoria.js';
import { ConexionFalsa } from '../support/ConexionFalsa.js';
import { configPrueba } from '../support/configPrueba.js';
import { crearContenedorPrueba } from '../support/crearContenedorPrueba.js';
import { crearLoggerSilencioso } from '../support/LoggerSilencioso.js';

const infra = () =>
  construirInfraestructura({
    cfg: configPrueba(),
    logger: crearLoggerSilencioso(),
    conexion: new ConexionFalsa(),
    usuarioDAO: new UsuarioDAOMemoria(),
    lugarDAO: new LugarDAOMemoria(),
    reporteDAO: new ReporteDAOMemoria(),
    hasher: new HasherFalso(),
    emisorToken: new EmisorTokenFalso(),
  });
const modulos = (montajes: readonly { modulo: string }[]) => montajes.map((m) => m.modulo);

describe('builders por stream', () => {
  it.each([
    ['seguridad (C0/M1)', construirSeguridad, ['auth', 'usuario', 'recuperacion']],
    ['lugar (M2)', construirLugar, ['lugar']],
    ['favoritoAlerta (M3)', (i) => construirFavoritoAlerta(i, crearContenedorPrueba().favoritoAlerta), ['favorito', 'alerta']],
    ['reporte (M4)', construirReporte, ['reporte', 'analitica']],
    ['validacion (M5)', (i) => construirValidacion(i, { validacionDAO: new ValidacionDAOMemoria(), denunciaDAO: new DenunciaDAOMemoria() }), ['validacion']],
    ['moderacion (M6)', (i) => construirModeracion(i, new DenunciaDAOMemoria()), ['moderacion']],
  ] as const satisfies readonly (readonly [string, (i: ReturnType<typeof infra>) => readonly { modulo: string }[], readonly string[]])[])('%s devuelve solo sus routers', (_nombre, construir, esperados) => {
    expect(modulos(construir(infra()))).toEqual(esperados);
  });

  it('infraestructura expone los puertos compartidos y los guardas de ruta', () => {
    const i = infra();
    expect(i.reloj.ahora()).toBeInstanceOf(Date);
    expect(typeof i.autenticar).toBe('function');
    expect(typeof i.guardas.requerirAdmin).toBe('function');
  });
});

describe('ensamblar', () => {
  const { contenedor } = crearContenedorPrueba();
  const orden = modulos(contenedor.rutas);

  it('monta todos los modulos una sola vez', () => {
    expect([...orden].sort()).toEqual(
      [
        'sistema', 'auth', 'usuario', 'recuperacion', 'lugar', 'favorito', 'alerta',
        'reporte', 'analitica', 'validacion', 'moderacion',
      ].sort(),
    );
  });

  it('respeta el orden congelado: reporte antes que validacion, sistema primero', () => {
    expect(orden[0]).toBe('sistema');
    expect(orden.indexOf('reporte')).toBeLessThan(orden.indexOf('validacion'));
  });

  it('sin DAOs inyectados arma los de Sequelize para favoritos/alertas y validacion sin tocar la base', () => {
    const conexion = new ConexionFalsa();
    const produccion = ensamblar({
      cfg: configPrueba(),
      logger: crearLoggerSilencioso(),
      conexion,
      usuarioDAO: new UsuarioDAOMemoria(),
      lugarDAO: new LugarDAOMemoria(),
      reporteDAO: new ReporteDAOMemoria(),
      hasher: new HasherFalso(),
      emisorToken: new EmisorTokenFalso(),
    });
    expect(modulos(produccion.rutas)).toEqual(orden);
    expect([conexion.verificaciones, conexion.transacciones]).toEqual([0, 0]);
  });

  it('crearContenedor falla rapido (rechaza) si Postgres no es alcanzable', async () => {
    const cfg = configPrueba({ DB_HOST: '127.0.0.1', DB_PUERTO: 1 });
    await expect(crearContenedor(cfg, crearLoggerSilencioso())).rejects.toThrow(/ECONNREFUSED|connect/i);
  });

  it('expone CORS y trust proxy desde la configuracion', () => {
    const ctx = crearContenedorPrueba({ cfg: { CORS_ORIGENES: 'http://a.pe', TRUST_PROXY: '2' } });
    expect(ctx.contenedor.corsOrigenes).toEqual(['http://a.pe']);
    expect(ctx.contenedor.trustProxy).toBe(2);
  });
});
