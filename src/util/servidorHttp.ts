import type { ConexionBD } from '../datasource/ConexionBD.js';
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
}

/**
 * Graceful shutdown: stop accepting connections and wait for in-flight requests (`server.close`),
 * then close the database connection, then exit. Idempotent while running; always exits, with 1
 * when anything failed or the close exceeded `timeoutMs`.
 */
export function crearApagado({ servidor, conexion, logger, timeoutMs, salir }: DependenciasApagado) {
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

/**
 * Process-level hooks: SIGTERM/SIGINT start the orderly shutdown; an unhandled rejection is
 * logged and shuts down with 1; an uncaught exception leaves the process in an unknown state, so
 * it is logged as fatal and the process exits immediately.
 */
export function instalarHooksProceso({
  proceso,
  logger,
  apagar,
}: {
  proceso: ProcesoLike;
  logger: Logger;
  apagar: (motivo: string, codigo?: number) => Promise<void>;
}): void {
  for (const senal of ['SIGTERM', 'SIGINT']) proceso.on(senal, () => void apagar(senal, 0));
  proceso.on('unhandledRejection', (razon) => {
    logger.error({ err: razon }, 'Promesa rechazada sin manejar');
    void apagar('unhandledRejection', 1);
  });
  proceso.on('uncaughtException', (error) => {
    logger.fatal({ err: error }, 'Excepcion no capturada');
    proceso.exit(1);
  });
}
