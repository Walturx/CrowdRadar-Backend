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
  'req.headers.cookie',
  'res.headers["set-cookie"]',
  // Database errors echo SQL text and bound values (emails, hashes).
  'err.sql',
  'err.parameters',
  'err.parent',
  'err.original',
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
