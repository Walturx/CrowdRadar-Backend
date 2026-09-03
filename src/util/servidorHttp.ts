import type { ConexionBD } from '../datasource/ConexionBD.js';
import type { EstadoServicio } from './EstadoServicio.js';
import type { Logger } from './logger.js';

export interface TimeoutsServidor {
  requestMs: number;
  headersMs: number;
  keepAliveMs: number;
}

/** Slow-client protection: bounded time to send headers, the whole request and idle keep-alive. */
export function configurarTimeouts(
  servidor: { requestTimeout: number; headersTimeout: number; keepAliveTimeout: number },
  { requestMs, headersMs, keepAliveMs }: TimeoutsServidor,
): void {
  servidor.requestTimeout = requestMs;
  servidor.headersTimeout = headersMs;
  servidor.keepAliveTimeout = keepAliveMs;
}

export interface DependenciasApagado {
  servidor: { close(callback: (error?: Error) => void): unknown };
  conexion: Pick<ConexionBD, 'cerrar'>;
  logger: Logger;
  /** Hard limit; when the orderly close takes longer the process exits with 1. */
  timeoutMs: number;
  salir: (codigo: number) => void;
  /** Flipped to "apagando" when the shutdown starts (readiness answers 503). */
  estado?: EstadoServicio;
}

/**
 * Graceful shutdown: stop accepting connections and wait for in-flight requests (`server.close`),
 * then close the database connection, then exit. Idempotent while running; always exits, with 1
 * when anything failed or the close exceeded `timeoutMs`.
 */
export function crearApagado({ servidor, conexion, logger, timeoutMs, salir, estado }: DependenciasApagado) {
  let enCurso: Promise<void> | undefined;

  const cerrarServidor = () =>
    new Promise<void>((resolver, rechazar) => {
      servidor.close((error) => (error ? rechazar(error) : resolver()));
    });

  async function ejecutar(motivo: string, codigo: number): Promise<void> {
    logger.info({ motivo }, 'Apagando el servidor');
    let codigoFinal = codigo;
    try {
      await cerrarServidor();
    } catch (error) {
      logger.error({ err: error }, 'Error al cerrar el servidor HTTP');
      codigoFinal = 1;
    }
    try {
      await conexion.cerrar();
    } catch (error) {
      logger.error({ err: error }, 'Error al cerrar la conexion a la base de datos');
      codigoFinal = 1;
    }
    logger.info({ codigo: codigoFinal }, 'Servidor apagado');
    salir(codigoFinal);
  }

  return (motivo: string, codigo = 0): Promise<void> => {
    estado?.marcarApagando();
    enCurso ??= (async () => {
      let temporizador: NodeJS.Timeout | undefined;
      const limite = new Promise<void>((resolver) => {
        temporizador = setTimeout(() => {
          logger.error({ timeoutMs }, 'El apagado excedio el tiempo limite; se fuerza la salida');
          salir(1);
          resolver();
        }, timeoutMs);
        temporizador.unref();
      });
      await Promise.race([ejecutar(motivo, codigo), limite]);
      clearTimeout(temporizador);
    })();
    return enCurso;
  };
}

/** The slice of `process` the hooks need; tests pass an EventEmitter. */
export interface ProcesoLike {
  on(evento: string, oyente: (...argumentos: unknown[]) => void): unknown;
  exit(codigo?: number): unknown;
}

/** Longest an uncaught exception waits for the pool to close before the process exits. */
const PLAZO_CIERRE_FATAL_MS = 2000;

/**
 * Process-level hooks: the first SIGTERM/SIGINT starts the orderly shutdown and a second one forces an
 * immediate exit with 1 (an operator who signals twice wants out now); an unhandled rejection is logged and
 * shuts down with 1; an uncaught exception leaves the process in an unknown state, so it is logged as fatal,
 * the pool gets a short deadline to close (releases connections instead of waiting for Postgres to time them
 * out) and the process exits with 1 either way.
 */
export function instalarHooksProceso({
  proceso,
  logger,
  apagar,
  cerrarRecursos,
  plazoCierreMs = PLAZO_CIERRE_FATAL_MS,
}: {
  proceso: ProcesoLike;
  logger: Logger;
  apagar: (motivo: string, codigo?: number) => Promise<void>;
  cerrarRecursos?: () => Promise<void>;
  plazoCierreMs?: number;
}): void {
  let senales = 0;
  for (const senal of ['SIGTERM', 'SIGINT']) {
    proceso.on(senal, () => {
      senales += 1;
      if (senales > 1) {
        logger.error({ senal }, 'Se recibio una segunda senal de apagado; se fuerza la salida');
        proceso.exit(1);
        return;
      }
      void apagar(senal, 0);
    });
  }
  proceso.on('unhandledRejection', (razon) => {
    logger.error({ err: razon }, 'Promesa rechazada sin manejar');
    void apagar('unhandledRejection', 1);
  });
  proceso.on('uncaughtException', (error) => {
    logger.fatal({ err: error }, 'Excepcion no capturada');
    if (!cerrarRecursos) {
      proceso.exit(1);
      return;
    }
    let terminado = false;
    const terminar = () => {
      if (terminado) return;
      terminado = true;
      clearTimeout(limite);
      proceso.exit(1);
    };
    const limite = setTimeout(terminar, plazoCierreMs);
    Promise.resolve()
      .then(cerrarRecursos)
      .catch((fallo: unknown) => logger.error({ err: fallo }, 'Error al cerrar la conexion tras una excepcion no capturada'))
      .finally(terminar);
  });
}
