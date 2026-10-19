/**
 * The unhandled-500 guard (setupGuardiaErrorInterno.ts) really wraps the error middleware the apps under test use:
 * only the generic 500 ERROR_INTERNO is recorded, mapped failures are not, and the opt-in clears the record.
 * Each test drains the record itself so the global afterEach check stays green.
 */
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { ConflictoException } from '../../src/exception/http/ConflictoException.js';
import { NoImplementadoException } from '../../src/exception/http/NoImplementadoException.js';
import { ServicioNoDisponibleException } from '../../src/exception/http/ServicioNoDisponibleException.js';
import { crearAppPrueba } from './appPrueba.js';
import { extraerErroresNoPermitidos, permitirErrorInterno } from './guardiaErrorInterno.js';

const appQueLanza = (valor: unknown) =>
  crearAppPrueba({
    montar: (app) =>
      app.get('/falla', () => {
        throw valor;
      }),
  });

describe('guardia de errores 500 no manejados', () => {
  it('registra la peticion y el error que terminaron en 500 ERROR_INTERNO', async () => {
    const error = new TypeError('Cannot read properties of undefined');
    const res = await request(appQueLanza(error)).get('/falla?x=1');
    expect(res.status).toBe(500);
    expect(extraerErroresNoPermitidos()).toEqual([{ peticion: 'GET /falla?x=1', error }]);
  });

  it.each([
    ['409 CONFLICTO', new ConflictoException()],
    ['501 NO_IMPLEMENTADO', new NoImplementadoException()],
    ['503 SERVICIO_NO_DISPONIBLE', new ServicioNoDisponibleException()],
  ])('no registra errores mapeados (%s), aunque sean 5xx', async (_caso, error) => {
    const res = await request(appQueLanza(error)).get('/falla');
    expect(res.status).toBe(error.status);
    expect(extraerErroresNoPermitidos()).toEqual([]);
  });

  it('permitirErrorInterno() descarta lo registrado en la prueba actual y no se arrastra a la siguiente', async () => {
    permitirErrorInterno();
    await request(appQueLanza(new Error('esperado'))).get('/falla');
    expect(extraerErroresNoPermitidos()).toEqual([]);

    await request(appQueLanza(new Error('ya no permitido'))).get('/falla');
    expect(extraerErroresNoPermitidos()).toHaveLength(1);
  });
});
