import { crearLogger, type Logger } from '../../src/util/logger.js';

export type LineaLog = Record<string, unknown>;

/** Real pino logger (with the production redaction) that records every JSON line it writes. */
export function crearLoggerEspia(nivel = 'debug'): { logger: Logger; lineas: LineaLog[] } {
  const lineas: LineaLog[] = [];
  const logger = crearLogger(nivel, {
    write(linea: string) {
      lineas.push(JSON.parse(linea) as LineaLog);
    },
  });
  return { logger, lineas };
}
