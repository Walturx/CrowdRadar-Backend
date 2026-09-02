/** traducirError for transport-level (body-parser) 4xx errors that must not become 500s. */
import { describe, expect, it } from 'vitest';
import { traducirError } from '../../src/middleware/manejarErrores.js';

const errorHttp = (type: string, status: number, message = 'x') =>
  Object.assign(new Error(message), { type, status, statusCode: status, expose: true });

describe('traducirError: errores 4xx de body-parser', () => {
  it.each([
    ['encoding.unsupported', 415],
    ['charset.unsupported', 415],
    ['request.aborted', 400],
  ])('%s -> %i con code VALIDACION_FALLIDA y sin detalle interno', (type, status) => {
    const { status: obtenido, body, esInterno } = traducirError(errorHttp(type, status, 'detalle: secreto'));
    expect(obtenido).toBe(status);
    expect(body.code).toBe('VALIDACION_FALLIDA');
    expect(esInterno).toBe(false);
    expect(JSON.stringify(body)).not.toContain('secreto');
  });

  it('un Error con status 5xx sigue siendo 500 ERROR_INTERNO', () => {
    const { status, esInterno } = traducirError(Object.assign(new Error('x'), { status: 502, expose: false }));
    expect(status).toBe(500);
    expect(esInterno).toBe(true);
  });

  it('el 500 incluye requestId solo cuando se conoce', () => {
    expect(traducirError(new Error('x'), 'abc').body).toMatchObject({ requestId: 'abc' });
    expect(traducirError(new Error('x')).body).not.toHaveProperty('requestId');
  });
});
