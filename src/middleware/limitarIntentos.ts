import type { Request, RequestHandler } from 'express';
import { ipKeyGenerator, rateLimit } from 'express-rate-limit';
import { DemasiadasSolicitudesException } from '../exception/http/DemasiadasSolicitudesException.js';
import { DemasiadosIntentosException } from '../exception/http/DemasiadosIntentosException.js';

/** What one counter is keyed by. `email` ignores the IP so distributed guessing against one account is still counted. */
export type ClaveLimite = 'ip' | 'ip+email' | 'email';

export interface OpcionesLimite {
  /** Attempts allowed inside the window. */
  max: number;
  ventanaMs: number;
  /** Default `ip`. */
  clave?: ClaveLimite;
  /** Count only failed responses (status >= 400); successful ones give their slot back. Used by the per-email lockout. */
  soloFallidos?: boolean;
  /** Answer 429 DEMASIADOS_INTENTOS (account lockout) instead of DEMASIADAS_SOLICITUDES. */
  bloqueo?: boolean;
  mensaje?: string;
}

/** Longest email the API accepts; longer keys are cut so a client cannot grow the counter store. */
const LARGO_MAXIMO_CLAVE = 120;

const emailDe = (cuerpo: unknown): string => {
  const email = (cuerpo as { email?: unknown } | undefined)?.email;
  return typeof email === 'string' ? email.trim().toLowerCase().slice(0, LARGO_MAXIMO_CLAVE) : '';
};

/** Seconds until the window of the offending key resets, as exposed by express-rate-limit. */
const segundosHastaReinicio = (req: Request): number | undefined => {
  const reinicio = (req as Request & { rateLimit?: { resetTime?: Date } }).rateLimit?.resetTime;
  return reinicio ? Math.max(1, Math.ceil((reinicio.getTime() - Date.now()) / 1000)) : undefined;
};

/**
 * Rate limit middleware (express-rate-limit, in-memory store, one counter per call).
 * Limits come from the configuration and are wired by the routes; exceeding one raises a 429
 * exception (with `Retry-After`) so the error middleware answers with the envelope.
 */
export function limitarIntentos({ max, ventanaMs, clave = 'ip', soloFallidos = false, bloqueo = false, mensaje }: OpcionesLimite): RequestHandler {
  return rateLimit({
    windowMs: ventanaMs,
    limit: max,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skipSuccessfulRequests: soloFallidos,
    // Without an email there is nothing to lock out; validation answers 400 and the IP limiter still applies.
    skip: (req) => clave === 'email' && emailDe(req.body) === '',
    keyGenerator: (req) => {
      if (clave === 'email') return emailDe(req.body);
      const ip = ipKeyGenerator(req.ip ?? '');
      return clave === 'ip+email' ? `${ip}|${emailDe(req.body)}` : ip;
    },
    handler: (req, _res, next) => {
      const reintentarEnSeg = segundosHastaReinicio(req);
      next(bloqueo ? new DemasiadosIntentosException(reintentarEnSeg, mensaje) : new DemasiadasSolicitudesException(mensaje, reintentarEnSeg));
    },
  });
}
