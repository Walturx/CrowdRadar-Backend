/**
 * Route-table test (spec R-A10, C.11): every frozen (method, path) exists. Public stubs answer
 * 501 NO_IMPLEMENTADO, authenticated ones 401 without a token, admin ones 403 for a USUARIO;
 * a valid token reaches the 501. No frozen path may ever return 404.
 */
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { Rol } from '../../src/enum/Rol.js';
import { crearContenedorPrueba } from '../support/crearContenedorPrueba.js';
import { aUsuario } from '../support/fabrica/datos.js';
import { TABLA_RUTAS, type FilaRuta } from './tablaRutas.js';

const ctx = crearContenedorPrueba();
const app = createApp(ctx.contenedor);
const tokenDe = (rol: Rol) => {
  const usuario = ctx.usuarioDAO.agregar(aUsuario({ rol, email: `${rol.toLowerCase()}@crowdradar.pe` }));
  return `Bearer ${ctx.emisorToken.emitir(usuario).token}`;
};
const TOKEN_USUARIO = tokenDe(Rol.USUARIO);
const TOKEN_ADMIN = tokenDe(Rol.ADMIN);

const llamar = (fila: FilaRuta, token?: string) => {
  const req = request(app)[fila.metodo](fila.ruta).send(fila.metodo === 'get' || fila.metodo === 'delete' ? undefined : {});
  return token ? req.set('Authorization', token) : req;
};
const esNoImplementado = (res: request.Response, fila: FilaRuta) => {
  expect(res.status).toBe(501);
  expect(res.body).toMatchObject({ code: 'NO_IMPLEMENTADO', errors: [] });
  expect(res.body.message).toContain(fila.nombre);
};

describe('tabla de rutas congelada', () => {
  it('cubre las 34 rutas del contrato (sin contar GET / y /api/salud)', () => {
    expect(TABLA_RUTAS).toHaveLength(34);
  });

  describe.each(TABLA_RUTAS)('$metodo $ruta ($acceso)', (fila) => {
    if (fila.acceso === 'publica') {
      it('sin token responde 501 NO_IMPLEMENTADO del handler correcto', async () => {
        esNoImplementado(await llamar(fila), fila);
      });
    } else {
      it('sin token responde 401 NO_AUTENTICADO (antes del 501), nunca 404', async () => {
        const res = await llamar(fila);
        expect(res.status).toBe(401);
        expect(res.body.code).toBe('NO_AUTENTICADO');
      });
    }

    if (fila.acceso === 'auth') {
      it('con token de USUARIO llega al 501 del handler correcto', async () => {
        esNoImplementado(await llamar(fila, TOKEN_USUARIO), fila);
      });
    }

    if (fila.acceso === 'admin') {
      it('con token de USUARIO responde 403 ACCESO_DENEGADO (antes del 501)', async () => {
        const res = await llamar(fila, TOKEN_USUARIO);
        expect(res.status).toBe(403);
        expect(res.body.code).toBe('ACCESO_DENEGADO');
      });

      it('con token de ADMIN llega al 501 del handler correcto', async () => {
        esNoImplementado(await llamar(fila, TOKEN_ADMIN), fila);
      });
    }
  });

  it('un token invalido en una ruta stub protegida responde 401 TOKEN_INVALIDO', async () => {
    const res = await request(app).get('/api/lugares').set('Authorization', 'Bearer abc.def.ghi');
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('TOKEN_INVALIDO');
  });

  it('una ruta que no esta en el contrato sigue siendo 404 RUTA_NO_ENCONTRADA', async () => {
    const res = await request(app).get('/api/lugares/12/inexistente').set('Authorization', TOKEN_USUARIO);
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('RUTA_NO_ENCONTRADA');
  });
});
