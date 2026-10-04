/** PUT /api/users/password against the fake container. Spec M1 R5, R6; HU 2.3 c2-c4. */
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { crearContenedorPrueba } from '../support/crearContenedorPrueba.js';
import { RelojFijo } from '../support/RelojFijo.js';
import { UsuarioDAOMemoria } from '../support/dao/memoria/UsuarioDAOMemoria.js';

const registro = { nombre: 'Ana', apellido: 'Ruiz', email: 'ana.ruiz@crowdradar.pe', password: 'Vieja1234', telefono: '', distrito: 'Miraflores' };
const NUEVA = 'Nueva12345';

describe('PUT /api/users/password (politica unica y sesion anterior invalidada)', () => {
  let app: ReturnType<typeof createApp>;
  let jwt: string;

  const cambiar = (cuerpo: Record<string, unknown>, token = jwt) =>
    request(app).put('/api/users/password').set('Authorization', `Bearer ${token}`).send(cuerpo);
  const cuerpo = (extra: Record<string, unknown> = {}) => ({ passwordActual: registro.password, nuevaPassword: NUEVA, confirmarPassword: NUEVA, ...extra });

  beforeEach(async () => {
    // The clock sits a few seconds ahead so password_cambiada_en is later than the iat of a JWT issued "now".
    const reloj = new RelojFijo(new Date(Date.now() + 5000));
    app = createApp(crearContenedorPrueba({ reloj, usuarioDAO: new UsuarioDAOMemoria({ reloj }) }).contenedor);
    jwt = (await request(app).post('/api/auth/register').send(registro)).body.data.token;
  });

  it('200 and the new password logs in while the old one does not', async () => {
    expect((await cambiar(cuerpo())).status).toBe(200);
    expect((await request(app).post('/api/auth/login').send({ email: registro.email, password: registro.password })).status).toBe(401);
    expect((await request(app).post('/api/auth/login').send({ email: registro.email, password: NUEVA })).status).toBe(200);
  });

  it('400 with one error per unmet requirement (HU 2.3 c4)', async () => {
    const res = await cambiar(cuerpo({ nuevaPassword: 'abc', confirmarPassword: 'abc' }));
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDACION_FALLIDA');
    expect(res.body.errors).toHaveLength(3);
    expect(new Set(res.body.errors.map((e: { mensaje: string }) => e.mensaje)).size).toBe(3);
  });

  it('422 PASSWORD_ACTUAL_INCORRECTA with a wrong current password (HU 2.3 c3)', async () => {
    const res = await cambiar(cuerpo({ passwordActual: 'Equivocada1' }));
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('PASSWORD_ACTUAL_INCORRECTA');
  });

  it('422 PASSWORD_REPETIDA when the new password equals the current one', async () => {
    const res = await cambiar(cuerpo({ nuevaPassword: registro.password, confirmarPassword: registro.password }));
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('PASSWORD_REPETIDA');
  });

  it('the JWT issued before the change is rejected afterwards (401 TOKEN_INVALIDO)', async () => {
    expect((await cambiar(cuerpo())).status).toBe(200);
    const res = await request(app).get('/api/users/profile').set('Authorization', `Bearer ${jwt}`);
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('TOKEN_INVALIDO');
  });

  it('429 DEMASIADAS_SOLICITUDES on the 6th attempt from one IP', async () => {
    for (let i = 0; i < 5; i++) expect((await cambiar(cuerpo({ passwordActual: 'Equivocada1' }))).status).toBe(422);
    const res = await cambiar(cuerpo({ passwordActual: 'Equivocada1' }));
    expect(res.status).toBe(429);
    expect(res.body.code).toBe('DEMASIADAS_SOLICITUDES');
  });
});
