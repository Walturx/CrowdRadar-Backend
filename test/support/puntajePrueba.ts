import type { ReglaEstadoValidacion } from '../../src/pattern/strategy/confiabilidad/derivarEstadoValidacion.js';
import { PuntajeServiceImpl } from '../../src/service/impl/PuntajeServiceImpl.js';
import type { PuntajeService } from '../../src/service/PuntajeService.js';
import { PuntajeDAOMemoria } from './dao/memoria/PuntajeDAOMemoria.js';
import { ReporteDAOMemoria } from './dao/memoria/ReporteDAOMemoria.js';
import { ValidacionDAOMemoria } from './dao/memoria/ValidacionDAOMemoria.js';

/** The default validation-state rule of the configuration (CONFIABILIDAD_* defaults). */
export const REGLA_PRUEBA: ReglaEstadoValidacion = { minVotos: 3, umbralAlta: 70, umbralMedia: 40, minVotosEstado: 10 };

/** A real PuntajeService over in-memory reports and votes (fresh ones when omitted), for tests that build services by hand. */
export function puntajeEnMemoria(
  reportes: ReporteDAOMemoria = new ReporteDAOMemoria(),
  validaciones: ValidacionDAOMemoria = new ValidacionDAOMemoria(),
): PuntajeService {
  return new PuntajeServiceImpl({ puntajeDAO: new PuntajeDAOMemoria({ reportes, validaciones }), regla: REGLA_PRUEBA });
}
