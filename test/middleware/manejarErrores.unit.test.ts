/**
 * manejarErrores: the single error middleware (spec R-A6.2, R-A6.3) and rutaNoEncontrada.
 * Error mapping table, exercised through real Express routes.
 */
import type { NextFunction, Request, Response } from 'express';
import {
  ConnectionAcquireTimeoutError,
  ConnectionRefusedError,
  ConnectionTimedOutError,
  DatabaseError,
  HostNotFoundError,
  UniqueConstraintError,
} from 'sequelize';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { CodigoError } from '../../src/exception/CodigoError.js';
import { AccesoDenegadoException } from '../../src/exception/http/AccesoDenegadoException.js';
import { ConflictoException } from '../../src/exception/http/ConflictoException.js';
import { DemasiadasSolicitudesException } from '../../src/exception/http/DemasiadasSolicitudesException.js';
import { DemasiadosIntentosException } from '../../src/exception/http/DemasiadosIntentosException.js';
import { NoAutenticadoException } from '../../src/exception/http/NoAutenticadoException.js';
import { NoImplementadoException } from '../../src/exception/http/NoImplementadoException.js';
import { RecursoNoEncontradoException } from '../../src/exception/http/RecursoNoEncontradoException.js';
import { ReglaNegocioException } from '../../src/exception/http/ReglaNegocioException.js';
import { ServicioNoDisponibleException } from '../../src/exception/http/ServicioNoDisponibleException.js';
import { ValidacionException } from '../../src/exception/http/ValidacionException.js';
import { crearManejadorErrores, traducirError } from '../../src/middleware/manejarErrores.js';
import { crearAppPrueba } from '../support/appPrueba.js';
import { crearLoggerEspia } from '../support/LoggerEspia.js';

const appQueLanza = (error: unknown, opciones: { limiteJson?: string; logger?: ReturnType<typeof crearLoggerEspia>['logger'] } = {}) =>
  crearAppPrueba({
    ...opciones,
    montar: (app) => {
      app.get('/falla', () => {
        throw error;
      });
      app.post('/eco', (req, res) => {
        res.json(req.body);
      });
    },
  });

describe('manejarErrores: excepciones de dominio', () => {
  it.each([
    [new ValidacionException([{ campo: 'email', mensaje: 'Correo inválido.' }]), 400, 'VALIDACION_FALLIDA', 'Datos inválidos.', 1],
    [new NoAutenticadoException(CodigoError.NO_AUTENTICADO, 'Debes iniciar sesión.'), 401, 'NO_AUTENTICADO', 'Debes iniciar sesión.', 0],
    [new AccesoDenegadoException(), 403, 'ACCESO_DENEGADO', 'No tienes permisos para realizar esta acción.', 0],
    [new RecursoNoEncontradoException(CodigoError.USUARIO_NO_ENCONTRADO, 'Usuario no encontrado.'), 404, 'USUARIO_NO_ENCONTRADO', 'Usuario no encontrado.', 0],
    [new ConflictoException(CodigoError.EMAIL_DUPLICADO, 'El correo ya está registrado.'), 409, 'EMAIL_DUPLICADO', 'El correo ya está registrado.', 0],
    [new ReglaNegocioException(CodigoError.PASSWORD_REPETIDA, 'No puedes reutilizar tu contraseña.'), 422, 'PASSWORD_REPETIDA', 'No puedes reutilizar tu contraseña.', 0],
    [new DemasiadasSolicitudesException(), 429, 'DEMASIADAS_SOLICITUDES', 'Demasiadas solicitudes. Inténtalo más tarde.', 0],
    [new NoImplementadoException(), 501, 'NO_IMPLEMENTADO', 'Funcionalidad no implementada.', 0],
    [new ServicioNoDisponibleException(), 503, 'SERVICIO_NO_DISPONIBLE', 'Servicio no disponible. Inténtalo de nuevo más tarde.', 0],
  ])('%o -> %i %s con el sobre {message, code, errors}', async (excepcion, status, code, message, totalErrores) => {
    const res = await request(appQueLanza(excepcion)).get('/falla');
    expect(res.status).toBe(status);
    expect(res.body).toMatchObject({ code, message });
    expect(res.body.errors).toHaveLength(totalErrores);
    expect(Object.keys(res.body).sort()).toEqual(['code', 'errors', 'message']);
  });

  it('conserva los errores por campo en el sobre', async () => {
    const excepcion = new ValidacionException([
      { campo: 'email', mensaje: 'Correo inválido.' },
      { campo: 'password', mensaje: 'Demasiado corta.' },
    ]);
    const res = await request(appQueLanza(excepcion)).get('/falla');
    expect(res.body.errors).toEqual([
      { campo: 'email', mensaje: 'Correo inválido.' },
      { campo: 'password', mensaje: 'Demasiado corta.' },
    ]);
  });
});

describe('manejarErrores: errores de infraestructura', () => {
  it('JSON malformado -> 400 JSON_INVALIDO', async () => {
    const res = await request(appQueLanza(new Error('no se usa')))
      .post('/eco')
      .set('Content-Type', 'application/json')
      .send('{bad');
    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      message: 'El cuerpo de la solicitud no es un JSON válido.',
      code: 'JSON_INVALIDO',
      errors: [],
    });
  });

  it('cuerpo mas grande que el limite -> 413 VALIDACION_FALLIDA', async () => {
    const app = appQueLanza(new Error('no se usa'), { limiteJson: '1kb' });
    const res = await request(app).post('/eco').send({ texto: 'x'.repeat(5000) });
    expect(res.status).toBe(413);
    expect(res.body.code).toBe('VALIDACION_FALLIDA');
    expect(res.body.message).toBe('El cuerpo de la solicitud es demasiado grande.');
  });

  it('UniqueConstraintError de Sequelize -> 409 CONFLICTO', async () => {
    const res = await request(appQueLanza(new UniqueConstraintError({ message: 'duplicate key' }))).get('/falla');
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ message: 'El recurso ya existe o está en conflicto.', code: 'CONFLICTO', errors: [] });
  });

  it.each([
    ['ConnectionRefusedError', new ConnectionRefusedError(new Error('connect ECONNREFUSED'))],
    ['ConnectionTimedOutError', new ConnectionTimedOutError(new Error('timeout'))],
    ['HostNotFoundError', new HostNotFoundError(new Error('getaddrinfo ENOTFOUND'))],
    ['error de red de Node', Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:5432'), { code: 'ECONNREFUSED' })],
  ])('conectividad (%s) -> 503 SERVICIO_NO_DISPONIBLE sin detalles internos', async (_nombre, error) => {
    const res = await request(appQueLanza(error)).get('/falla');
    expect(res.status).toBe(503);
    expect(res.body.code).toBe('SERVICIO_NO_DISPONIBLE');
    expect(JSON.stringify(res.body)).not.toContain('ECONNREFUSED');
  });

  it('error desconocido -> 500 ERROR_INTERNO sin stack ni detalle, y se registra en el servidor', async () => {
    const { logger, lineas } = crearLoggerEspia();
    const res = await request(appQueLanza(new Error('clave de la base: s3creto'), { logger })).get('/falla');

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ message: 'Error interno del servidor.', code: 'ERROR_INTERNO', errors: [] });
    expect(JSON.stringify(res.body)).not.toContain('s3creto');
    expect(JSON.stringify(res.body)).not.toContain('at ');

    const registro = lineas.find((linea) => linea.level === 50);
    expect(registro).toBeDefined();
    expect((registro?.err as { message: string }).message).toBe('clave de la base: s3creto');
  });

  it('los errores de dominio 4xx no se registran como error', async () => {
    const { logger, lineas } = crearLoggerEspia();
    await request(appQueLanza(new AccesoDenegadoException(), { logger })).get('/falla');
    expect(lineas.filter((linea) => (linea.level as number) >= 50)).toHaveLength(0);
  });

  it('un valor lanzado que no es Error tambien produce 500 ERROR_INTERNO', async () => {
    const res = await request(appQueLanza('texto suelto')).get('/falla');
    expect(res.status).toBe(500);
    expect(res.body.code).toBe('ERROR_INTERNO');
  });
});

describe('manejarErrores: reintento sugerido (R4-414, R1-401)', () => {
  const statementTimeout = () =>
    new DatabaseError(Object.assign(new Error('canceling statement due to statement timeout'), { code: '57014', sql: '' }));

  it('statement_timeout de Postgres (57014) -> 503 SERVICIO_NO_DISPONIBLE con Retry-After', async () => {
    const res = await request(appQueLanza(statementTimeout())).get('/falla');
    expect(res.status).toBe(503);
    expect(res.body).toEqual({
      message: 'Servicio no disponible. Inténtalo de nuevo más tarde.',
      code: 'SERVICIO_NO_DISPONIBLE',
      errors: [],
    });
    expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
  });

  it('otro error de base de datos sigue siendo 500 y no lleva Retry-After', async () => {
    const otro = new DatabaseError(Object.assign(new Error('syntax error at or near'), { code: '42601', sql: '' }));
    const res = await request(appQueLanza(otro)).get('/falla');
    expect(res.status).toBe(500);
    expect(res.headers['retry-after']).toBeUndefined();
  });

  it('timeout al adquirir una conexion del pool -> 503 con Retry-After', async () => {
    const res = await request(appQueLanza(new ConnectionAcquireTimeoutError(new Error('acquire')))).get('/falla');
    expect(res.status).toBe(503);
    expect(res.body.code).toBe('SERVICIO_NO_DISPONIBLE');
    expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
  });

  it('conectividad (ECONNREFUSED) tambien sugiere reintento', async () => {
    const res = await request(appQueLanza(new ConnectionRefusedError(new Error('x')))).get('/falla');
    expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
  });

  it('429 con reintentarEnSeg expone Retry-After', async () => {
    const res = await request(appQueLanza(new DemasiadasSolicitudesException(undefined, 42))).get('/falla');
    expect(res.status).toBe(429);
    expect(res.headers['retry-after']).toBe('42');
  });

  it('DemasiadosIntentosException -> 429 DEMASIADOS_INTENTOS con Retry-After', async () => {
    const res = await request(appQueLanza(new DemasiadosIntentosException(900))).get('/falla');
    expect(res.status).toBe(429);
    expect(res.body.code).toBe('DEMASIADOS_INTENTOS');
    expect(res.headers['retry-after']).toBe('900');
  });

  it('un 429 sin reintentarEnSeg no inventa la cabecera', async () => {
    const res = await request(appQueLanza(new DemasiadasSolicitudesException())).get('/falla');
    expect(res.headers['retry-after']).toBeUndefined();
  });
});

describe('traducirError', () => {
  it('es una funcion pura que devuelve status y cuerpo', () => {
    expect(traducirError(new ConflictoException(CodigoError.FAVORITO_DUPLICADO, 'Ya es favorito.'))).toEqual({
      status: 409,
      body: { message: 'Ya es favorito.', code: 'FAVORITO_DUPLICADO', errors: [] },
      esInterno: false,
    });
    expect(traducirError(new Error('x')).esInterno).toBe(true);
  });
});

describe('crearManejadorErrores', () => {
  it('si la respuesta ya comenzo, delega en el manejador por defecto de Express', () => {
    const manejador = crearManejadorErrores(crearLoggerEspia().logger);
    const siguiente = vi.fn();
    const error = new Error('tarde');
    manejador(error, {} as Request, { headersSent: true } as Response, siguiente as NextFunction);
    expect(siguiente).toHaveBeenCalledWith(error);
  });
});

describe('rutaNoEncontrada', () => {
  it('GET a una ruta inexistente -> 404 RUTA_NO_ENCONTRADA con el sobre (no HTML)', async () => {
    const res = await request(crearAppPrueba({ montar: () => undefined })).get('/api/inexistente');
    expect(res.status).toBe(404);
    expect(res.headers['content-type']).toContain('application/json');
    expect(res.body).toEqual({ message: 'Ruta no encontrada.', code: 'RUTA_NO_ENCONTRADA', errors: [] });
  });

  it('cualquier metodo a una ruta inexistente responde igual', async () => {
    const res = await request(crearAppPrueba({ montar: () => undefined })).delete('/api/otra/cosa/9');
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('RUTA_NO_ENCONTRADA');
  });

  it('una ruta existente no cae en el 404', async () => {
    const app = crearAppPrueba({
      montar: (a) => {
        a.get('/api/ok', (_req, res) => {
          res.json({ ok: true });
        });
      },
    });
    const res = await request(app).get('/api/ok');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });
});
