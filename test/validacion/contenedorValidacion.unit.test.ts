/** container/validacion.ts: strategy selection by CONFIABILIDAD_ESTRATEGIA and wiring of the M5 services. */
import { describe, expect, it } from 'vitest';
import { construirInfraestructura } from '../../src/container/infraestructura.js';
import { construirServiciosValidacion, elegirEstrategiaConfiabilidad } from '../../src/container/validacion.js';
import { TipoAccionValidacion } from '../../src/enum/TipoAccionValidacion.js';
import { EmisorTokenFalso } from '../support/adapter/EmisorTokenFalso.js';
import { HasherFalso } from '../support/adapter/HasherFalso.js';
import { ConexionFalsa } from '../support/ConexionFalsa.js';
import { configPrueba } from '../support/configPrueba.js';
import { crearLoggerSilencioso } from '../support/LoggerSilencioso.js';
import { DenunciaDAOMemoria } from '../support/dao/memoria/DenunciaDAOMemoria.js';
import { LugarDAOMemoria } from '../support/dao/memoria/LugarDAOMemoria.js';
import { ReporteDAOMemoria } from '../support/dao/memoria/ReporteDAOMemoria.js';
import { UsuarioDAOMemoria } from '../support/dao/memoria/UsuarioDAOMemoria.js';
import { ValidacionDAOMemoria } from '../support/dao/memoria/ValidacionDAOMemoria.js';
import { aReporte, aUsuario } from '../support/fabrica/datos.js';

const C = TipoAccionValidacion.CONFIRMAR;
const R = TipoAccionValidacion.RECHAZAR;
/** One heavy confirmation (karma 900, weight 6 or 1) against three plain rejections. */
const VOTOS = [
  { tipoAccion: C, karmaVotante: 900 },
  { tipoAccion: R, karmaVotante: 0 },
  { tipoAccion: R, karmaVotante: 0 },
  { tipoAccion: R, karmaVotante: 0 },
];

describe('elegirEstrategiaConfiabilidad', () => {
  it('PONDERADA_KARMA (por defecto) pesa el karma con su tope', () => {
    expect(elegirEstrategiaConfiabilidad(configPrueba()).calcular(VOTOS).porcentaje).toBe(66.67);
    expect(elegirEstrategiaConfiabilidad(configPrueba({ TOPE_KARMA_PESO: 0 })).calcular(VOTOS).porcentaje).toBe(25);
  });

  it('SIMPLE ignora el karma', () => {
    expect(elegirEstrategiaConfiabilidad(configPrueba({ CONFIABILIDAD_ESTRATEGIA: 'SIMPLE' })).calcular(VOTOS).porcentaje).toBe(25);
  });

  it('usa el minimo de votos y los umbrales de la configuracion', () => {
    const estrategia = elegirEstrategiaConfiabilidad(configPrueba({ CONFIABILIDAD_MIN_VOTOS: 5 }));
    expect(estrategia.calcular(VOTOS).nivel).toBe('INSUFICIENTE');
  });
});

describe('construirServiciosValidacion', () => {
  it('arma servicios que trabajan con los DAOs entregados y CONFIABILIDAD_MIN_VOTOS_ESTADO', async () => {
    const usuarioDAO = new UsuarioDAOMemoria();
    const reporteDAO = new ReporteDAOMemoria();
    const infra = construirInfraestructura({
      cfg: configPrueba({ CONFIABILIDAD_MIN_VOTOS_ESTADO: 1, CONFIABILIDAD_MIN_VOTOS: 1 }),
      logger: crearLoggerSilencioso(),
      conexion: new ConexionFalsa(),
      usuarioDAO,
      lugarDAO: new LugarDAOMemoria(),
      reporteDAO,
      hasher: new HasherFalso(),
      emisorToken: new EmisorTokenFalso(),
    });
    const { validacionService } = construirServiciosValidacion(infra, {
      validacionDAO: new ValidacionDAOMemoria(),
      denunciaDAO: new DenunciaDAOMemoria(),
    });
    const autor = usuarioDAO.agregar(aUsuario()).id;
    const votante = usuarioDAO.agregar(aUsuario()).id;
    const reporte = reporteDAO.agregar(aReporte({ usuarioId: autor })).id;
    const resultado = await validacionService.validar(votante, reporte, C);
    expect(resultado.confiabilidad).toMatchObject({ estado: 'VALIDADO', porcentaje: 100 });
  });
});
