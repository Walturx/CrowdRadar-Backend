/** validar: zod validation of body, query and params. Spec R-A2.2, R-A6.3 (VALIDACION_FALLIDA). */
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { validar } from '../../src/middleware/validar.js';
import { crearAppPrueba } from '../support/appPrueba.js';

const registroSchema = z.strictObject({
  nombre: z.string().min(2, 'El nombre debe tener al menos 2 caracteres.'),
  email: z.email().transform((valor) => valor.toLowerCase()),
  password: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres.'),
});

const app = crearAppPrueba({
  montar: (a) => {
    a.post('/registro', validar({ body: registroSchema }), (req, res) => {
      res.json(req.body);
    });
    a.get(
      '/lugares/:id',
      validar({
        params: z.object({ id: z.coerce.number().int().positive() }),
        query: z.object({ page: z.coerce.number().int().min(1).default(1), q: z.string().min(2).optional() }),
      }),
      (_req, res) => {
        res.json({ params: res.locals.params, query: res.locals.query });
      },
    );
  },
});

describe('validar (body)', () => {
  it('cuerpo valido: continua con el cuerpo parseado (transformaciones aplicadas)', async () => {
    const res = await request(app)
      .post('/registro')
      .send({ nombre: 'Ana', email: 'ANA@Crowdradar.PE', password: 'Secreta123' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ nombre: 'Ana', email: 'ana@crowdradar.pe', password: 'Secreta123' });
  });

  it('un campo invalido -> 400 VALIDACION_FALLIDA con una entrada para ese campo', async () => {
    const res = await request(app)
      .post('/registro')
      .send({ nombre: 'Ana', email: 'x', password: 'Secreta123' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDACION_FALLIDA');
    expect(res.body.message).toBe('Datos inválidos.');
    expect(res.body.errors).toHaveLength(1);
    expect(res.body.errors[0].campo).toBe('email');
    expect(res.body.errors[0].mensaje.length).toBeGreaterThan(0);
  });

  it('varios campos invalidos -> una entrada por campo, con el mensaje propio del esquema', async () => {
    const res = await request(app).post('/registro').send({ nombre: 'A', email: 'x', password: 'corta' });
    expect(res.status).toBe(400);
    expect(res.body.errors.map((e: { campo: string }) => e.campo).sort()).toEqual(['email', 'nombre', 'password']);
    expect(res.body.errors).toEqual(
      expect.arrayContaining([
        { campo: 'nombre', mensaje: 'El nombre debe tener al menos 2 caracteres.' },
        { campo: 'password', mensaje: 'La contraseña debe tener al menos 8 caracteres.' },
      ]),
    );
  });

  it('campos desconocidos (strict) -> una entrada por clave sobrante', async () => {
    const res = await request(app)
      .post('/registro')
      .send({ nombre: 'Ana', email: 'a@b.pe', password: 'Secreta123', rol: 'ADMIN', extra: 1 });
    expect(res.status).toBe(400);
    expect(res.body.errors).toEqual([
      { campo: 'rol', mensaje: 'Campo no permitido.' },
      { campo: 'extra', mensaje: 'Campo no permitido.' },
    ]);
  });

  it('sin cuerpo -> 400 con errores en espanol (no mensajes en ingles de zod)', async () => {
    const res = await request(app).post('/registro');
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDACION_FALLIDA');
    expect(res.body.errors.length).toBeGreaterThan(0);
    for (const error of res.body.errors) expect(error.mensaje).not.toMatch(/Invalid input/i);
  });
});

describe('validar (params y query)', () => {
  it('valores validos: continua con params y query tipados en res.locals', async () => {
    const res = await request(app).get('/lugares/7?page=3&q=par');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ params: { id: 7 }, query: { page: 3, q: 'par' } });
  });

  it('aplica los valores por defecto de la query', async () => {
    const res = await request(app).get('/lugares/7');
    expect(res.body.query).toEqual({ page: 1 });
  });

  it('param o query invalidos -> 400 con los campos de ambos', async () => {
    const res = await request(app).get('/lugares/abc?page=0&q=x');
    expect(res.status).toBe(400);
    expect(res.body.errors.map((e: { campo: string }) => e.campo).sort()).toEqual(['id', 'page', 'q']);
  });
});
