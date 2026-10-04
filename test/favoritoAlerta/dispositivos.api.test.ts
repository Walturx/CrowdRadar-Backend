/**
 * API tests of the push devices (spec M3 R7, S25-S26; frontend contract AlertaRepositoryHttp): POST
 * /api/dispositivos and DELETE /api/dispositivos/:token against the fake container (no database).
 * Security rule (frontend review R1-801): a token belongs to ONE user; DELETE never leaks whose token it is.
 */
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { PlataformaPush } from '../../src/enum/PlataformaPush.js';
import { crearContenedorPrueba, type ContenedorPrueba } from '../support/crearContenedorPrueba.js';
import { aUsuario } from '../support/fabrica/datos.js';

describe('dispositivos (contenedor de prueba)', () => {
  let ctx: ContenedorPrueba;
  let app: ReturnType<typeof createApp>;

  const nuevoUsuario = () => {
    const usuario = ctx.usuarioDAO.agregar(aUsuario());
    return { id: usuario.id, auth: { Authorization: `Bearer ${ctx.emisorToken.emitir(usuario).token}` } };
  };
  const registrar = (auth: { Authorization: string }, cuerpo: object) =>
    request(app).post('/api/dispositivos').set(auth).send(cuerpo);

  let ana: ReturnType<typeof nuevoUsuario>;
  let beto: ReturnType<typeof nuevoUsuario>;

  beforeEach(() => {
    ctx = crearContenedorPrueba();
    app = createApp(ctx.contenedor);
    ana = nuevoUsuario();
    beto = nuevoUsuario();
  });

  describe('POST /api/dispositivos', () => {
    it('sin token responde 401 NO_AUTENTICADO', async () => {
      const res = await request(app).post('/api/dispositivos').send({ token: 't', plataforma: 'ANDROID' });
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('NO_AUTENTICADO');
    });

    it('201 al registrar un token nuevo y queda asociado al usuario', async () => {
      const res = await registrar(ana.auth, { token: 'tok-1', plataforma: 'ANDROID' });
      expect(res.status).toBe(201);
      expect(res.body.message).toBe('Dispositivo registrado correctamente.');
      expect(await ctx.dispositivoDAO.listarTokensPorUsuario(ana.id)).toEqual(['tok-1']);
    });

    it('200 al repetir el mismo token (S25): una sola fila y la plataforma se actualiza', async () => {
      await registrar(ana.auth, { token: 'tok-1', plataforma: 'ANDROID' });
      const res = await registrar(ana.auth, { token: 'tok-1', plataforma: 'IOS' });
      expect(res.status).toBe(200);
      expect(await ctx.dispositivoDAO.listarTokensPorUsuario(ana.id)).toEqual(['tok-1']);
      const repetido = await ctx.dispositivoDAO.registrar(ana.id, 'tok-1', PlataformaPush.IOS);
      expect(repetido.dispositivo.plataforma).toBe('IOS');
    });

    it('un token registrado por otro usuario pasa al nuevo: el anterior dueno deja de recibir (R1-801)', async () => {
      await registrar(ana.auth, { token: 'tok-compartido', plataforma: 'ANDROID' });
      const res = await registrar(beto.auth, { token: 'tok-compartido', plataforma: 'ANDROID' });
      expect(res.status).toBe(200);
      expect(await ctx.dispositivoDAO.listarTokensPorUsuario(ana.id)).toEqual([]);
      expect(await ctx.dispositivoDAO.listarTokensPorUsuario(beto.id)).toEqual(['tok-compartido']);
    });

    it('con DISPOSITIVOS_MAX_POR_USUARIO=2 el tercer dispositivo desaloja al mas antiguo', async () => {
      const limitado = crearContenedorPrueba({ cfg: { DISPOSITIVOS_MAX_POR_USUARIO: 2 } });
      const appLimitada = createApp(limitado.contenedor);
      const usuario = limitado.usuarioDAO.agregar(aUsuario());
      const auth = { Authorization: `Bearer ${limitado.emisorToken.emitir(usuario).token}` };
      for (const token of ['uno', 'dos', 'tres']) {
        expect((await request(appLimitada).post('/api/dispositivos').set(auth).send({ token, plataforma: 'ANDROID' })).status).toBe(201);
      }
      expect(await limitado.dispositivoDAO.listarTokensPorUsuario(usuario.id)).toEqual(['dos', 'tres']);
    });

    it.each([
      ['letras, digitos y los separadores de FCM', 'abc:APA91b-xyz_123.45'],
      ['hexadecimal de APNs', 'a'.repeat(64)],
    ])('acepta un token con %s', async (_caso, token) => {
      expect((await registrar(ana.auth, { token, plataforma: 'ANDROID' })).status).toBe(201);
    });

    it.each([
      ['espacios', 'tok con espacio'],
      ['etiqueta HTML', '<script>x</script>'],
      ['salto de linea', 'tok\nlinea'],
      ['comillas', "tok'--"],
    ])('400 VALIDACION_FALLIDA con un token con %s (juego de caracteres)', async (_caso, token) => {
      const res = await registrar(ana.auth, { token, plataforma: 'ANDROID' });
      expect(res.status).toBe(400);
      expect(res.body.errors.map((e: { campo: string }) => e.campo)).toContain('token');
      expect(await ctx.dispositivoDAO.listarTokensPorUsuario(ana.id)).toEqual([]);
    });

    it.each([
      ['1 caracter', 't'],
      ['255 caracteres', 't'.repeat(255)],
    ])('acepta un token de %s (limite valido)', async (_caso, token) => {
      expect((await registrar(ana.auth, { token, plataforma: 'ANDROID' })).status).toBe(201);
    });

    it.each([
      ['vacio', { token: '', plataforma: 'ANDROID' }, 'token'],
      ['de 256 caracteres', { token: 't'.repeat(256), plataforma: 'ANDROID' }, 'token'],
      ['ausente', { plataforma: 'ANDROID' }, 'token'],
      ['no texto', { token: 12, plataforma: 'ANDROID' }, 'token'],
      ['plataforma WEB (S26)', { token: 'tok', plataforma: 'WEB' }, 'plataforma'],
      ['plataforma ausente', { token: 'tok' }, 'plataforma'],
      ['clave extra', { token: 'tok', plataforma: 'IOS', usuarioId: 9 }, 'usuarioId'],
    ])('400 VALIDACION_FALLIDA con %s, nombrando el campo y sin guardar nada', async (_caso, cuerpo, campo) => {
      const res = await registrar(ana.auth, cuerpo);
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDACION_FALLIDA');
      expect(res.body.errors.map((e: { campo: string }) => e.campo)).toContain(campo);
      expect(await ctx.dispositivoDAO.listarTokensPorUsuario(ana.id)).toEqual([]);
    });
  });

  describe('DELETE /api/dispositivos/:token', () => {
    it('sin token responde 401', async () => {
      expect((await request(app).delete('/api/dispositivos/tok-1')).status).toBe(401);
    });

    it('204 sin cuerpo al borrar el propio y deja de listarse', async () => {
      await registrar(ana.auth, { token: 'tok-1', plataforma: 'ANDROID' });
      const res = await request(app).delete('/api/dispositivos/tok-1').set(ana.auth);
      expect(res.status).toBe(204);
      expect(res.text).toBe('');
      expect(await ctx.dispositivoDAO.listarTokensPorUsuario(ana.id)).toEqual([]);
    });

    it('es idempotente: borrar un token inexistente tambien responde 204', async () => {
      expect((await request(app).delete('/api/dispositivos/nunca-existio').set(ana.auth)).status).toBe(204);
    });

    it('borrar el token de otro usuario responde 204 igual y NO lo borra (no filtra su existencia)', async () => {
      await registrar(beto.auth, { token: 'tok-de-beto', plataforma: 'IOS' });
      const res = await request(app).delete('/api/dispositivos/tok-de-beto').set(ana.auth);
      expect(res.status).toBe(204);
      expect(res.text).toBe('');
      expect(await ctx.dispositivoDAO.listarTokensPorUsuario(beto.id)).toEqual(['tok-de-beto']);
    });

    it('decodifica el token de la URL (los tokens FCM llevan ":" y la app lo codifica)', async () => {
      const token = 'abc:APA91b-xyz_123';
      await registrar(ana.auth, { token, plataforma: 'ANDROID' });
      const res = await request(app).delete(`/api/dispositivos/${encodeURIComponent(token)}`).set(ana.auth);
      expect(res.status).toBe(204);
      expect(await ctx.dispositivoDAO.listarTokensPorUsuario(ana.id)).toEqual([]);
    });

    it('400 VALIDACION_FALLIDA con un token de 256 caracteres', async () => {
      const res = await request(app).delete(`/api/dispositivos/${'t'.repeat(256)}`).set(ana.auth);
      expect(res.status).toBe(400);
      expect(res.body.errors[0].campo).toBe('token');
    });
  });
});
