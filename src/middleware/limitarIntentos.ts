import type { RequestHandler } from 'express';
import { ipKeyGenerator, rateLimit } from 'express-rate-limit';
import { DemasiadasSolicitudesException } from '../exception/http/DemasiadasSolicitudesException.js';

export interface OpcionesLimite {
  /** Attempts allowed inside the window. */
  max: number;
  ventanaMs: number;
  /** Key by IP + `body.email` (case-insensitive) instead of IP alone. */
  claveEmail?: boolean;
  /** Count only failed responses (status >= 400), e.g. wrong-password logins. */
  soloFallidos?: boolean;
  mensaje?: string;
}

const emailDe = (cuerpo: unknown): string => {
  const email = (cuerpo as { email?: unknown } | undefined)?.email;
  return typeof email === 'string' ? email.trim().toLowerCase() : '';
};

/**
 * Rate limit middleware (express-rate-limit, in-memory store, one counter per call).
 * Limits come from the configuration and are wired by the routes; exceeding one raises
 * DemasiadasSolicitudesException so the error middleware answers 429 with the envelope.
 */
export function limitarIntentos({ max, ventanaMs, claveEmail = false, soloFallidos = false, mensaje }: OpcionesLimite): RequestHandler {
  return rateLimit({
    windowMs: ventanaMs,
    limit: max,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skipSuccessfulRequests: soloFallidos,
    keyGenerator: (req) => {
      const ip = ipKeyGenerator(req.ip ?? '');
      return claveEmail ? `${ip}|${emailDe(req.body)}` : ip;
    },
    handler: (_req, _res, next) => next(new DemasiadasSolicitudesException(mensaje)),
  });
}
