/** Composition of the reports stream: strategy picked by SATURACION_ESTRATEGIA and numbers taken from the config. */
import { describe, expect, it } from 'vitest';
import { construirServiciosReporte, elegirEstrategiaSaturacion } from '../../src/container/reporte.js';
import { NivelSaturacion } from '../../src/enum/NivelSaturacion.js';
import { SaturacionPonderadaStrategy } from '../../src/pattern/strategy/saturacion/impl/SaturacionPonderadaStrategy.js';
import { SaturacionUltimoReporteStrategy } from '../../src/pattern/strategy/saturacion/impl/SaturacionUltimoReporteStrategy.js';
import { ConexionFalsa } from '../support/ConexionFalsa.js';
import { crearLoggerSilencioso } from '../support/LoggerSilencioso.js';
import { RelojFijo } from '../support/RelojFijo.js';
import { LugarDAOMemoria } from '../support/dao/memoria/LugarDAOMemoria.js';
import { ReporteDAOMemoria } from '../support/dao/memoria/ReporteDAOMemoria.js';
import { UsuarioDAOMemoria } from '../support/dao/memoria/UsuarioDAOMemoria.js';
import { configPrueba, type SobrescritosEntorno } from '../support/configPrueba.js';
import { aReporte } from '../support/fabrica/datos.js';

const AHORA = new Date('2026-10-05T15:00:00Z');

describe('elegirEstrategiaSaturacion', () => {
  it('PONDERADA (default) devuelve la estrategia ponderada con los umbrales de la configuracion', () => {
    const estrategia = elegirEstrategiaSaturacion(configPrueba({ SATURACION_MIN_REPORTES: 1 }));
    expect(estrategia).toBeInstanceOf(SaturacionPonderadaStrategy);
    const unSaturado = [aReporte({ nivelSaturacion: NivelSaturacion.SATURADO, fechaHora: AHORA })];
    expect(estrategia.calcular(unSaturado, AHORA)).toBe('SATURADO'); // one report is enough with the minimum at 1
  });

  it('ULTIMO_REPORTE devuelve la estrategia del ultimo reporte', () => {
    const estrategia = elegirEstrategiaSaturacion(configPrueba({ SATURACION_ESTRATEGIA: 'ULTIMO_REPORTE' }));
    expect(estrategia).toBeInstanceOf(SaturacionUltimoReporteStrategy);
    const unTranquilo = [aReporte({ nivelSaturacion: NivelSaturacion.TRANQUILO, fechaHora: AHORA })];
    expect(estrategia.calcular(unTranquilo, AHORA)).toBe('TRANQUILO'); // the default minimum of 3 would give null
  });

  it('con el minimo por defecto (3) la ponderada no da nivel con un solo reporte', () => {
    const unSaturado = [aReporte({ nivelSaturacion: NivelSaturacion.SATURADO, fechaHora: AHORA })];
    expect(elegirEstrategiaSaturacion(configPrueba()).calcular(unSaturado, AHORA)).toBeNull();
  });
});

describe('construirServiciosReporte', () => {
  const armar = async (cfg: SobrescritosEntorno = {}) => {
    const usuarioDAO = new UsuarioDAOMemoria();
    const lugarDAO = new LugarDAOMemoria();
    const reloj = new RelojFijo(AHORA);
    const servicios = construirServiciosReporte({
      cfg: configPrueba(cfg),
      reloj,
      logger: crearLoggerSilencioso(),
      conexion: new ConexionFalsa(),
      usuarioDAO,
      lugarDAO,
      reporteDAO: new ReporteDAOMemoria(),
      subject: { suscribir: () => {}, notificar: async () => {} },
    });
    const usuario = await usuarioDAO.crear({ nombre: 'Ana', apellido: 'Perez', email: 'ana@crowdradar.pe', passwordHash: 'h', telefono: null, distrito: null });
    return { servicios, reloj, usuarioId: usuario.id, lugarId: lugarDAO.agregar().id };
  };

  it('la fachada ensamblada reporta con el karma y el cooldown de la configuracion', async () => {
    const { servicios, reloj, usuarioId, lugarId } = await armar({ KARMA_POR_REPORTE: 7, COOLDOWN_REPORTE_MIN: 5 });
    const primero = await servicios.reporteFacade.registrar(usuarioId, lugarId, NivelSaturacion.MODERADO);
    expect(primero.karma).toMatchObject({ puntosGanados: 7, total: 7 });
    reloj.avanzarMinutos(4);
    await expect(servicios.reporteFacade.registrar(usuarioId, lugarId, NivelSaturacion.MODERADO)).rejects.toMatchObject({
      status: 422,
      message: 'Ya reportaste este lugar. Vuelve a intentarlo en 1 minuto.',
    });
    reloj.avanzarMinutos(1);
    const segundo = await servicios.reporteFacade.registrar(usuarioId, lugarId, NivelSaturacion.MODERADO);
    expect(segundo.karma.total).toBe(14);
  });

  it('expone el karma y la saturacion que otros streams (M5, M6) reutilizan', async () => {
    const { servicios, usuarioId } = await armar({ KARMA_POR_VALIDACION: 3 });
    expect(await servicios.karmaService.otorgarPorValidacion(usuarioId, {} as never)).toBe(3);
    expect(servicios.saturacionService.recalcular).toBeTypeOf('function');
  });
});
