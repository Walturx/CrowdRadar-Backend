/** container/validacion.ts: the reliability strategy (every vote weighs 1) and wiring of the M5 services. */
import { describe, expect, it } from 'vitest';
import { construirInfraestructura } from '../../src/container/infraestructura.js';
import { construirServiciosValidacion, crearEstrategiaConfiabilidad } from '../../src/container/validacion.js';
import { TipoAccionValidacion } from '../../src/enum/TipoAccionValidacion.js';
import { EmisorTokenFalso } from '../support/adapter/EmisorTokenFalso.js';
import { HasherFalso } from '../support/adapter/HasherFalso.js';
import { ConexionFalsa } from '../support/ConexionFalsa.js';
import { configPrueba, type SobrescritosEntorno } from '../support/configPrueba.js';
import { crearLoggerSilencioso } from '../support/LoggerSilencioso.js';
import { DenunciaDAOMemoria } from '../support/dao/memoria/DenunciaDAOMemoria.js';
import { LugarDAOMemoria } from '../support/dao/memoria/LugarDAOMemoria.js';
import { ReporteDAOMemoria } from '../support/dao/memoria/ReporteDAOMemoria.js';
import { UsuarioDAOMemoria } from '../support/dao/memoria/UsuarioDAOMemoria.js';
import { ValidacionDAOMemoria } from '../support/dao/memoria/ValidacionDAOMemoria.js';
import { aReporte, aUsuario } from '../support/fabrica/datos.js';

const C = TipoAccionValidacion.CONFIRMAR;
const R = TipoAccionValidacion.RECHAZAR;
/** One confirmation against three rejections. */
const VOTOS = [C, R, R, R].map((tipoAccion) => ({ tipoAccion }));

describe('crearEstrategiaConfiabilidad', () => {
  it('cada voto pesa 1: una confirmacion contra tres rechazos es 25 BAJA', () => {
    expect(crearEstrategiaConfiabilidad(configPrueba()).calcular(VOTOS)).toEqual({ nivel: 'BAJA', porcentaje: 25, votos: 4 });
  });

  it('usa el minimo de votos y los umbrales de la configuracion', () => {
    expect(crearEstrategiaConfiabilidad(configPrueba({ CONFIABILIDAD_MIN_VOTOS: 5 })).calcular(VOTOS).nivel).toBe('INSUFICIENTE');
    expect(crearEstrategiaConfiabilidad(configPrueba({ CONFIABILIDAD_UMBRAL_MEDIA: 20 })).calcular(VOTOS).nivel).toBe('MEDIA');
  });
});

describe('construirServiciosValidacion', () => {
  function armar(sobrescritos: SobrescritosEntorno = {}) {
    const usuarioDAO = new UsuarioDAOMemoria();
    const reporteDAO = new ReporteDAOMemoria();
    const infra = construirInfraestructura({
      cfg: configPrueba(sobrescritos),
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
    return { usuarioDAO, reporteDAO, validacionService };
  }

  it('arma servicios que trabajan con los DAOs entregados y CONFIABILIDAD_MIN_VOTOS_ESTADO', async () => {
    const { usuarioDAO, reporteDAO, validacionService } = armar({ CONFIABILIDAD_MIN_VOTOS_ESTADO: 1, CONFIABILIDAD_MIN_VOTOS: 1 });
    const autor = usuarioDAO.agregar(aUsuario()).id;
    const votante = usuarioDAO.agregar(aUsuario()).id;
    const reporte = reporteDAO.agregar(aReporte({ usuarioId: autor })).id;
    const resultado = await validacionService.validar(votante, reporte, C);
    expect(resultado.confiabilidad).toMatchObject({ estado: 'VALIDADO', porcentaje: 100 });
  });

  it('dos votos validos de usuarios con distinto puntaje aportan lo mismo a la confiabilidad', async () => {
    const { usuarioDAO, reporteDAO, validacionService } = armar();
    const autor = usuarioDAO.agregar(aUsuario()).id;
    const veterano = usuarioDAO.agregar(aUsuario({ puntosKarma: 900 })).id;
    const novatos = [usuarioDAO.agregar(aUsuario()).id, usuarioDAO.agregar(aUsuario()).id];

    // The veteran confirms and two newcomers reject: 1 of 3 whatever the veteran's score.
    const confirmado = reporteDAO.agregar(aReporte({ usuarioId: autor })).id;
    await validacionService.validar(veterano, confirmado, C);
    for (const novato of novatos) await validacionService.validar(novato, confirmado, R);
    expect(await validacionService.consultarConfiabilidad(confirmado)).toMatchObject({ porcentaje: 33.33, nivel: 'BAJA' });

    // And the other way round: the veteran's rejection weighs the same as each newcomer's confirmation.
    const rechazado = reporteDAO.agregar(aReporte({ usuarioId: autor })).id;
    await validacionService.validar(veterano, rechazado, R);
    for (const novato of novatos) await validacionService.validar(novato, rechazado, C);
    expect(await validacionService.consultarConfiabilidad(rechazado)).toMatchObject({ porcentaje: 66.67, nivel: 'MEDIA' });
  });
});
