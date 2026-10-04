import { randomUUID } from 'node:crypto';
import { pinoHttp, type HttpLogger } from 'pino-http';
import type { Logger } from '../util/logger.js';

/** Client supplied ids are reused only when they cannot inject anything into the logs. */
const ID_SEGURO = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * Request id plus one structured log line per request (pino-http). The id comes from
 * a safe `X-Request-Id` header or a fresh UUID and is echoed back in the response.
 * Only method, url and status are logged: headers (Authorization, cookies) never are.
 */
export function crearRegistroPeticiones(logger: Logger): HttpLogger {
  return pinoHttp({
    logger,
    genReqId: (req, res) => {
      const entrante = req.headers['x-request-id'];
      const id = typeof entrante === 'string' && ID_SEGURO.test(entrante) ? entrante : randomUUID();
      res.setHeader('X-Request-Id', id);
      return id;
    },
    // The child logger (req.log) carries { reqId }, so every later log line of the request has it.
    quietReqLogger: true,
    customAttributeKeys: { reqId: 'reqId' },
    customLogLevel: (_req, res, error) => {
      if (error || res.statusCode >= 500) return 'error';
      return res.statusCode >= 400 ? 'warn' : 'info';
    },
    serializers: {
      req: (req: { method?: string; url?: string }) => ({ method: req.method, url: req.url }),
      res: (res: { statusCode?: number }) => ({ statusCode: res.statusCode }),
    },
  });
}
