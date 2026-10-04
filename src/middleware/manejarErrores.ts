import type { ErrorRequestHandler } from 'express';
import type { ErrorResponseDTO } from '../dto/ErrorResponseDTO.js';
import { AppException, type DetalleError } from '../exception/AppException.js';
import { CodigoError } from '../exception/CodigoError.js';
import type { Logger } from '../util/logger.js';

export interface ErrorTraducido {
  status: number;
  body: ErrorResponseDTO;
  /** True for unexpected errors (500 ERROR_INTERNO); false for known, mapped ones. */
  esInterno: boolean;
}

/** Node network error codes that mean "the dependency is unreachable". */
const CODIGOS_DE_RED = new Set(['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN', 'EHOSTUNREACH']);

/**
 * ORM error names (Sequelize*), matched by name so the web layer never imports the ORM
 * (dependency rule 3: only datasource/impl and dao/impl may).
 */
const NOMBRE_CONECTIVIDAD = /^Sequelize(Connection|HostNotFound|HostNotReachable|InvalidConnection|AccessDenied)/;

function esErrorDeConectividad(error: Error): boolean {
  const codigo = (error as { code?: unknown }).code;
  return NOMBRE_CONECTIVIDAD.test(error.name) || (typeof codigo === 'string' && CODIGOS_DE_RED.has(codigo));
}

const sobre = (code: string, message: string, errors: readonly DetalleError[] = []): ErrorResponseDTO => ({
  message,
  code,
  errors,
});

/**
 * body-parser (and other http-errors) failures that are the client's fault: unsupported
 * encoding/charset (415) or an aborted request (400). They carry a 4xx `status` and
 * `expose: true`; anything else with a status stays a 500.
 */
function statusDeClienteHttp(error: Error): number | undefined {
  const { status, expose } = error as { status?: unknown; expose?: unknown };
  return typeof status === 'number' && status >= 400 && status < 500 && expose === true ? status : undefined;
}

/** Pure mapping from any thrown value to the HTTP status and the error envelope. */
export function traducirError(error: unknown, requestId?: string): ErrorTraducido {
  if (error instanceof AppException) {
    return { status: error.status, body: sobre(error.code, error.message, error.errors), esInterno: false };
  }
  if (error instanceof Error) {
    const tipo = (error as { type?: unknown }).type;
    if (tipo === 'entity.parse.failed') {
      return {
        status: 400,
        body: sobre(CodigoError.JSON_INVALIDO, 'El cuerpo de la solicitud no es un JSON válido.'),
        esInterno: false,
      };
    }
    if (tipo === 'entity.too.large') {
      return {
        status: 413,
        body: sobre(CodigoError.VALIDACION_FALLIDA, 'El cuerpo de la solicitud es demasiado grande.'),
        esInterno: false,
      };
    }
    if (error.name === 'SequelizeUniqueConstraintError') {
      return {
        status: 409,
        body: sobre(CodigoError.CONFLICTO, 'El recurso ya existe o está en conflicto.'),
        esInterno: false,
      };
    }
    if (esErrorDeConectividad(error)) {
      return {
        status: 503,
        body: sobre(CodigoError.SERVICIO_NO_DISPONIBLE, 'Servicio no disponible. Inténtalo de nuevo más tarde.'),
        esInterno: false,
      };
    }
    const statusCliente = statusDeClienteHttp(error);
    if (statusCliente !== undefined) {
      return {
        status: statusCliente,
        body: sobre(CodigoError.VALIDACION_FALLIDA, 'La solicitud no es válida.'),
        esInterno: false,
      };
    }
  }
  const interno = sobre(CodigoError.ERROR_INTERNO, 'Error interno del servidor.');
  return { status: 500, body: requestId ? { ...interno, requestId } : interno, esInterno: true };
}

/**
 * The single error middleware: the only place that decides an HTTP status for a
 * failure. Server-side failures (5xx except 501) are logged with the full error;
 * the response never carries stack traces or internal detail.
 */
export function crearManejadorErrores(logger: Logger): ErrorRequestHandler {
  return (error, req, res, next) => {
    if (res.headersSent) {
      next(error);
      return;
    }
    const { status, body } = traducirError(error, req.id === undefined ? undefined : String(req.id));
    if (status >= 500 && status !== 501) {
      (req.log ?? logger).error({ err: error }, 'Error al atender la petición');
    }
    res.status(status).json(body);
  };
}
