import { CodigoError } from '../CodigoError.js';
import { ReglaNegocioException } from '../http/ReglaNegocioException.js';

/** 422: the user reported this place too recently. The app shows `message` as is, so it names the minutes left. */
export class ReporteEnEsperaException extends ReglaNegocioException {
  constructor(readonly minutosRestantes: number) {
    super(
      CodigoError.REPORTE_EN_ESPERA,
      `Ya reportaste este lugar. Vuelve a intentarlo en ${minutosRestantes} ${minutosRestantes === 1 ? 'minuto' : 'minutos'}.`,
    );
  }
}
