import { expect } from 'vitest';
import { DatabaseError, UniqueConstraintError } from 'sequelize';
import type { Response } from 'supertest';
import { REINTENTO_503_SEG } from '../../src/exception/http/ServicioNoDisponibleException.js';

/** A Sequelize DatabaseError carrying a Postgres SQLSTATE, as the real driver produces it. */
export const errorBD = (sqlstate: string, mensaje: string): DatabaseError =>
  new DatabaseError(Object.assign(new Error(mensaje), { code: sqlstate, sql: '' }));

export const lockTimeout = (): DatabaseError => errorBD('55P03', 'canceling statement due to lock timeout');
export const statementTimeout = (): DatabaseError => errorBD('57014', 'canceling statement due to statement timeout');
export const deadlock = (): DatabaseError => errorBD('40P01', 'deadlock detected');

/** A unique-index violation that no DAO translated (the error middleware maps it to 409 CONFLICTO). */
export const restriccionUnica = (): UniqueConstraintError =>
  new UniqueConstraintError({ message: 'llave duplicada viola restricción de unicidad «uq_prueba»', fields: { campo: 'x' } });

/** The 503 the client may retry: exact envelope and `Retry-After` in whole seconds. */
export function esperar503Reintentable(res: Response): void {
  expect(res.status).toBe(503);
  expect(res.body).toEqual({ message: 'Servicio no disponible. Inténtalo de nuevo más tarde.', code: 'SERVICIO_NO_DISPONIBLE', errors: [] });
  expect(res.headers['retry-after']).toBe(String(REINTENTO_503_SEG));
}
