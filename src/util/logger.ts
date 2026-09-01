import pino from 'pino';

export type Logger = pino.Logger;

/** Fields that must never reach the logs. */
const REDACCION = [
  'password',
  '*.password',
  'passwordHash',
  '*.passwordHash',
  'token',
  '*.token',
  'req.headers.authorization',
  'headers.authorization',
];

/**
 * Creates the application logger (pino) with the configured level and secret redaction.
 * `destino` lets tests capture the lines; production writes to stdout.
 */
export function crearLogger(nivel: string, destino?: pino.DestinationStream): Logger {
  return pino(
    {
      level: nivel,
      redact: { paths: REDACCION, censor: '[REDACTADO]' },
      timestamp: pino.stdTimeFunctions.isoTime,
    },
    destino,
  );
}
