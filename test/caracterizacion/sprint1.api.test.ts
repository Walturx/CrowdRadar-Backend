/**
 * Characterization of the account API contract first pinned on the Sprint 1 JavaScript
 * app (register, login, profile) and now served by the TypeScript layers.
 *
 * Two blocks:
 *  - "contenedor de prueba": supertest against createApp(crearContenedorPrueba()), fake DAOs,
 *    no database; runs in `npm test`.
 *  - "con base de datos": spawns the real server process against PostgreSQL; opt-in,
 *    skipped unless DATABASE_URL_TEST is set (runs db:migrate first).
 *
 * Documented differences from Sprint 1 (frontend contract): register answers
 * `{token, user}` (auto sign-in), the profile is `data.user`, a duplicate email is
 * 409 EMAIL_DUPLICADO and every error uses the `{message, code, errors}` envelope.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { crearContenedorPrueba } from '../support/crearContenedorPrueba.js';
import { ejecutarCli } from '../support/baseDatos.js';

const SECRETO = 's'.repeat(48);

describe('API de cuentas (contenedor de prueba, sin base de datos)', () => {
  const { contenedor } = crearContenedorPrueba();
  const app = createApp(contenedor);
  const email = 'ana.caracterizacion@crowdradar.pe';

  it('GET / responde el nombre de la API', async () => {
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: 'CrowdRadar API' });
  });

  it('register con email invalido responde 400 "Datos inválidos." con errores por campo', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ nombre: 'Ana', apellido: 'Perez', email: 'x', password: 'Secreta123' });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Datos inválidos.');
    expect(res.body.errors).toEqual(expect.arrayContaining([expect.objectContaining({ campo: 'email' })]));
  });

  it('register con campo desconocido responde 400', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ nombre: 'Ana', apellido: 'Perez', email: 'a@b.pe', password: 'Secreta123', rol: 'ADMIN' });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Datos inválidos.');
  });

  it('register con password corta responde 400 y nombra el campo password', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ nombre: 'Ana', apellido: 'Perez', email: 'a@b.pe', password: 'corta' });
    expect(res.status).toBe(400);
    expect(res.body.errors.map((e: { campo: string }) => e.campo)).toContain('password');
  });

  it('login sin password responde 400 "Datos inválidos."', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'a@b.pe' });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Datos inválidos.');
  });

  it('GET /api/users/profile sin cabecera responde 401 NO_AUTENTICADO con message', async () => {
    const res = await request(app).get('/api/users/profile');
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ code: 'NO_AUTENTICADO', errors: [] });
    expect(res.body.message).toEqual(expect.any(String));
  });

  it('GET /api/users/profile con token mal firmado responde 401 TOKEN_INVALIDO', async () => {
    const token = jwt.sign({ id: 1 }, 'o'.repeat(48));
    const res = await request(app).get('/api/users/profile').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ code: 'TOKEN_INVALIDO', errors: [] });
  });

  it('flujo feliz: register 201, login 200, GET y PUT /api/users/profile 200 con data.user', async () => {
    const registro = await request(app)
      .post('/api/auth/register')
      .send({ nombre: 'Ana', apellido: 'Perez', email, password: 'Secreta123', telefono: '987654321', distrito: 'Miraflores' });
    expect(registro.status).toBe(201);
    expect(registro.body.message).toBe('Usuario registrado correctamente.');
    expect(registro.body.data.token).toEqual(expect.any(String));
    expect(registro.body.data.user).toMatchObject({ id: expect.any(Number), nombre: 'Ana', apellido: 'Perez', email });

    const login = await request(app).post('/api/auth/login').send({ email, password: 'Secreta123' });
    expect(login.status).toBe(200);
    expect(login.body.message).toBe('Inicio de sesión exitoso.');
    expect(login.body.data.user).toMatchObject({ email, rol: 'USUARIO', status: 'ACTIVO' });
    const auth = { Authorization: `Bearer ${login.body.data.token}` };

    const perfil = await request(app).get('/api/users/profile').set(auth);
    expect(perfil.status).toBe(200);
    expect(perfil.body.data.user).toMatchObject({ email, nombre: 'Ana', distrito: 'Miraflores', rol: 'USUARIO', status: 'ACTIVO' });
    expect(perfil.body.data.user).not.toHaveProperty('passwordHash');

    const actualizado = await request(app).put('/api/users/profile').set(auth).send({ nombre: 'Anita', distrito: 'Barranco' });
    expect(actualizado.status).toBe(200);
    expect(actualizado.body.message).toBe('Perfil actualizado correctamente.');
    expect(actualizado.body.data.user).toMatchObject({ nombre: 'Anita', distrito: 'Barranco', apellido: 'Perez' });
    expect(actualizado.body.data.user).not.toHaveProperty('passwordHash');
  });
});

const urlBd = process.env.DATABASE_URL_TEST;
const entrada = process.env.SPRINT1_ENTRY ?? 'src/server.ts';
const directorioEntrada = process.env.SPRINT1_CWD ?? process.cwd();

function puertoLibre(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.listen(0, () => {
      const { port } = srv.address() as { port: number };
      srv.close(() => resolve(port));
    });
    srv.on('error', reject);
  });
}

async function esperarServidor(base: string, hijo: ChildProcess, salida: () => string): Promise<void> {
  const limite = Date.now() + 40000;
  while (Date.now() < limite) {
    if (hijo.exitCode !== null) throw new Error(`El servidor termino (${hijo.exitCode}): ${salida()}`);
    try {
      const res = await fetch(`${base}/`);
      if (res.status === 200) return;
    } catch {
      // not listening yet
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`El servidor no arranco a tiempo: ${salida()}`);
}

describe.skipIf(!urlBd)('API de cuentas (con base de datos)', () => {
  let hijo: ChildProcess;
  let base = '';
  const sufijo = Date.now().toString(36);
  const email = `ana.${sufijo}@crowdradar.pe`;
  const password = 'Secreta123';

  const json = async (ruta: string, init: RequestInit = {}) => {
    const res = await fetch(`${base}${ruta}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return { status: res.status, body: (await res.json()) as Record<string, any> };
  };

  beforeAll(async () => {
    const migracion = await ejecutarCli(['db:migrate'], urlBd as string);
    if (migracion.codigo !== 0) throw new Error(`db:migrate fallo: ${migracion.salida}`);
    const url = new URL(urlBd as string);
    const puerto = await puertoLibre();
    base = `http://127.0.0.1:${puerto}`;
    const env = {
      ...process.env,
      PUERTO: String(puerto),
      DB_HOST: url.hostname,
      DB_PUERTO: url.port || '5432',
      DB_NOMBRE: url.pathname.slice(1),
      DB_USUARIO: decodeURIComponent(url.username),
      DB_PASSWORD: decodeURIComponent(url.password),
      JWT_SECRETO: SECRETO,
    };
    const args = entrada.endsWith('.ts') ? ['--import', 'tsx', entrada] : [entrada];
    hijo = spawn(process.execPath, args, { cwd: directorioEntrada, env, stdio: ['ignore', 'pipe', 'pipe'] });
    let salida = '';
    hijo.stdout?.on('data', (d) => (salida += d));
    hijo.stderr?.on('data', (d) => (salida += d));
    await esperarServidor(base, hijo, () => salida);
  });

  afterAll(() => {
    hijo?.kill();
  });

  it('register responde 201 con token y el usuario sin password', async () => {
    const res = await json('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        nombre: 'Ana',
        apellido: 'Perez',
        email,
        password,
        telefono: '987654321',
        distrito: 'Miraflores',
      }),
    });
    expect(res.status).toBe(201);
    expect(res.body.message).toBe('Usuario registrado correctamente.');
    expect(res.body.data.token).toEqual(expect.any(String));
    expect(res.body.data.user).toMatchObject({ id: expect.any(Number), nombre: 'Ana', apellido: 'Perez', email });
    expect(JSON.stringify(res.body)).not.toMatch(/password|hash/i);
  });

  it('register con email repetido responde 409 EMAIL_DUPLICADO', async () => {
    const res = await json('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ nombre: 'Ana', apellido: 'Perez', email: email.toUpperCase(), password }),
    });
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ message: 'El correo ya está registrado.', code: 'EMAIL_DUPLICADO', errors: [] });
  });

  it('login responde 200 con data.token verificable y data.user', async () => {
    const res = await json('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Inicio de sesión exitoso.');
    expect(res.body.data.user).toMatchObject({ id: expect.any(Number), nombre: 'Ana', apellido: 'Perez', email, rol: 'USUARIO' });
    const payload = jwt.verify(res.body.data.token, SECRETO, { algorithms: ['HS256'] }) as jwt.JwtPayload;
    expect(payload).toMatchObject({ id: res.body.data.user.id, email, rol: 'USUARIO' });
  });

  it('login con password incorrecta y con email desconocido responden igual 401', async () => {
    const mala = await json('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password: 'Otra12345' }) });
    const desconocido = await json('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: `nadie.${sufijo}@crowdradar.pe`, password }),
    });
    expect(mala.status).toBe(401);
    expect(mala.body).toEqual({ message: 'Correo o contraseña incorrectos.', code: 'CREDENCIALES_INVALIDAS', errors: [] });
    expect(desconocido.status).toBe(mala.status);
    expect(desconocido.body).toEqual(mala.body);
  });

  it('GET y PUT /api/users/profile con token devuelven y actualizan el perfil sin hash', async () => {
    const login = await json('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
    const auth = { Authorization: `Bearer ${login.body.data.token}` };

    const perfil = await json('/api/users/profile', { headers: auth });
    expect(perfil.status).toBe(200);
    expect(perfil.body.data.user).toMatchObject({ email, nombre: 'Ana', distrito: 'Miraflores', rol: 'USUARIO', status: 'ACTIVO' });
    expect(JSON.stringify(perfil.body)).not.toMatch(/password|hash/i);

    const actualizado = await json('/api/users/profile', {
      method: 'PUT',
      headers: auth,
      body: JSON.stringify({ nombre: 'Anita', distrito: 'Barranco' }),
    });
    expect(actualizado.status).toBe(200);
    expect(actualizado.body.message).toBe('Perfil actualizado correctamente.');
    expect(actualizado.body.data.user).toMatchObject({ nombre: 'Anita', distrito: 'Barranco', apellido: 'Perez' });
  });

  it('un token valido de una cuenta suspendida en la BD recibe 403 CUENTA_SUSPENDIDA', async () => {
    const login = await json('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
    const { consultar } = await import('../support/baseDatos.js');
    await consultar(urlBd as string, `UPDATE usuario SET status = 'SUSPENDIDO' WHERE email = $1`, [email]);
    await consultar(
      urlBd as string,
      `INSERT INTO sancion_usuario (usuario_id, administrador_id, dias, motivo, fecha_inicio, fecha_fin)
       SELECT id, id, 3, 'Reportes falsos reiterados', now() - interval '1 day', now() + interval '2 days' FROM usuario WHERE email = $1`,
      [email],
    );
    const res = await json('/api/users/profile', { headers: { Authorization: `Bearer ${login.body.data.token}` } });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('CUENTA_SUSPENDIDA');
  });
});
