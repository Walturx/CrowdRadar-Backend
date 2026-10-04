import type { RequestHandler } from 'express';

/** Guards the stub routers chain in front of their handlers: auth chain and admin chain (design section 5). */
export interface MiddlewaresRuta {
  /** Bearer token -> user from the database -> account status. */
  autenticar: RequestHandler;
  /** Role guard for ADMIN; always placed after `autenticar`. */
  requerirAdmin: RequestHandler;
}
