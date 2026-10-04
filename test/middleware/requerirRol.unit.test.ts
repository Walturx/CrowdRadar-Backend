/** requerirRol: role guard after autenticar. Spec R-A7.3. */
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { Rol } from '../../src/enum/Rol.js';
import { requerirRol } from '../../src/middleware/requerirRol.js';
import { aUsuario } from '../support/fabrica/datos.js';
import { crearAppPrueba } from '../support/appPrueba.js';

const appCon = (rolDelUsuario: Rol | null) =>
  crearAppPrueba({
    montar: (app) => {
      app.get(
        '/admin',
        (req, _res, next) => {
          if (rolDelUsuario) req.usuario = aUsuario({ rol: rolDelUsuario });
          next();
        },
        requerirRol(Rol.ADMIN),
        (_req, res) => {
          res.json({ ok: true });
        },
      );
    },
  });

describe('requerirRol', () => {
  it('USUARIO en una ruta de ADMIN -> 403 ACCESO_DENEGADO', async () => {
    const res = await request(appCon(Rol.USUARIO)).get('/admin');
    expect(res.status).toBe(403);
    expect(res.body).toEqual({
      message: 'No tienes permisos para realizar esta acción.',
      code: 'ACCESO_DENEGADO',
      errors: [],
    });
  });

  it('ADMIN en una ruta de ADMIN -> continua', async () => {
    const res = await request(appCon(Rol.ADMIN)).get('/admin');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it('sin usuario autenticado (autenticar no corrio) -> 401 NO_AUTENTICADO', async () => {
    const res = await request(appCon(null)).get('/admin');
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('NO_AUTENTICADO');
  });
});
