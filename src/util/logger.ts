import pino from 'pino';

export type Logger = pino.Logger;

/** Secret-bearing keys. Wildcards cover them at every nesting level up to PROFUNDIDAD_MAXIMA. */
const CLAVES_SECRETAS = [
  'password',
  'passwordActual',
  'nuevaPassword',
  'passwordHash',
  'token',
  'tokenRecuperacion',
  'tokenFcm',
  'authorization',
];

/** fast-redact has no recursive wildcard, so every depth is expanded: `k`, `*.k`, `*.*.k`, ... */
const PROFUNDIDAD_MAXIMA = 5;

const rutasSecretas = CLAVES_SECRETAS.flatMap((clave) =>
  Array.from({ length: PROFUNDIDAD_MAXIMA }, (_, nivel) => [...Array<string>(nivel).fill('*'), clave].join('.')),
);

/** Fields that must never reach the logs. */
const REDACCION = [
  ...rutasSecretas,
  'req.headers.cookie',
  'res.headers["set-cookie"]',
  // Database and validation errors echo SQL text, bound values and the offending input (emails, hashes).
  'err.sql',
  'err.parameters',
  'err.parent',
  'err.original',
  'err.fields',
  'err.errors[*].value',
  // pino's err serializer mirrors `errors` as `aggregateErrors`.
  'err.aggregateErrors[*].value',
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
