/**
 * Black-box tests (equivalence partitions + boundary values) of GET /api/admin/usuarios, whose inputs are
 * q, status, orden, page and size, plus the access rules. Spec M6 R3, R6, S8, S9, S11, S12.
 */
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { EstadoCuenta } from '../../src/enum/EstadoCuenta.js';
import { Rol } from '../../src/enum/Rol.js';
import { crearContenedorPrueba, type ContenedorPrueba } from '../support/crearContenedorPrueba.js';
import { RelojFijo } from '../support/RelojFijo.js';
import { aUsuario } from '../support/fabrica/datos.js';

const AHORA = new Date('2026-10-05T15:00:00Z');
const MS_DIA = 86_400_000;

describe('GET /api/admin/usuarios (caja negra)', () => {
  let ctx: ContenedorPrueba;
  let app: ReturnType<typeof createApp>;
  let cabeceraAdmin: Record<string, string>;
  const cabeceraDe = (usuario: Parameters<ContenedorPrueba['emisorToken']['emitir']>[0]) => ({
    Authorization: `Bearer ${ctx.emisorToken.emitir(usuario).token}`,
  });
  const pedir = (consulta = '') => request(app).get(`/api/admin/usuarios${consulta ? `?${consulta}` : ''}`).set(cabeceraAdmin);
  const nombres = (res: request.Response) => res.body.data.items.map((i: { nombre: string }) => i.nombre);

  beforeEach(() => {
    ctx = crearContenedorPrueba({ reloj: new RelojFijo(AHORA) });
    app = createApp(ctx.contenedor);
    cabeceraAdmin = cabeceraDe(ctx.usuarioDAO.agregar(aUsuario({ rol: Rol.ADMIN, nombre: 'Admin', apellido: 'Root', email: 'admin@crowdradar.pe' })));
    ctx.usuarioDAO.agregar(aUsuario({ nombre: 'Lucia', apellido: 'Ramos', email: 'lucia@crowdradar.pe', puntosKarma: 10 }));
    ctx.usuarioDAO.agregar(aUsuario({ nombre: 'Pedro', apellido: 'Lucero', email: 'pedro@crowdradar.pe', puntosKarma: 50 }));
  });

  it('200 con los campos del contrato y sin el hash de la password', async () => {
    const res = await pedir('q=luc&orden=NOMBRE');
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ page: 1, size: 20, total: 2, totalPaginas: 1 });
    expect(res.body.data.items[0]).toEqual({
      id: expect.any(Number),
      nombre: 'Lucia',
      apellido: 'Ramos',
      email: 'lucia@crowdradar.pe',
      rol: 'USUARIO',
      status: 'ACTIVO',
      puntosKarma: 10,
      sancionVigente: null,
    });
    expect(JSON.stringify(res.body)).not.toMatch(/password|hash/i);
  });

  describe('q', () => {
    it('busca en nombre, apellido y email sin distinguir mayusculas (S9)', async () => {
      expect(nombres(await pedir('q=LUC&orden=NOMBRE'))).toEqual(['Lucia', 'Pedro']);
      expect(nombres(await pedir('q=ramos'))).toEqual(['Lucia']);
      expect(nombres(await pedir('q=pedro@crowdradar'))).toEqual(['Pedro']);
    });
    it('sin coincidencias es 200 con items vacios', async () => {
      const res = await pedir('q=zzzz');
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ items: [], total: 0, totalPaginas: 0 });
      expect(res.body.message).toBe('No se encontraron usuarios.');
    });
    it.each([['1 caracter (limite inferior - 1)', 'q=a'], ['81 caracteres (limite superior + 1)', `q=${'a'.repeat(81)}`]])('400 con %s (S12)', async (_n, consulta) => {
      const res = await pedir(consulta);
      expect([res.status, res.body.code]).toEqual([400, 'VALIDACION_FALLIDA']);
    });
    it.each([['2 caracteres', 'q=pe'], ['80 caracteres', `q=${'a'.repeat(80)}`]])('200 en el limite: %s', async (_n, consulta) => {
      expect((await pedir(consulta)).status).toBe(200);
    });
  });

  describe('status', () => {
    it('SUSPENDIDO devuelve solo suspendidos con la fecha de fin de la sancion vigente (S11)', async () => {
      const suspendido = ctx.usuarioDAO.agregar(aUsuario({ nombre: 'Rosa', status: EstadoCuenta.SUSPENDIDO }));
      await ctx.sancionDAO.crear({
        usuarioId: suspendido.id,
        administradorId: 1,
        dias: 7,
        motivo: 'Reportes falsos reiterados',
        fechaInicio: AHORA,
        fechaFin: new Date(AHORA.getTime() + 7 * MS_DIA),
      });
      const res = await pedir('status=SUSPENDIDO');
      expect(nombres(res)).toEqual(['Rosa']);
      expect(res.body.data.items[0].sancionVigente).toMatchObject({ dias: 7, fechaFin: new Date(AHORA.getTime() + 7 * MS_DIA).toISOString() });
    });
    it('ACTIVO excluye a los suspendidos', async () => {
      ctx.usuarioDAO.agregar(aUsuario({ nombre: 'Rosa', status: EstadoCuenta.SUSPENDIDO }));
      expect(nombres(await pedir('status=ACTIVO&orden=NOMBRE'))).not.toContain('Rosa');
    });
    it.each(['INVALIDO', 'activo', ''])('400 con status=%j (S12)', async (valor) => {
      expect((await pedir(`status=${valor}`)).status).toBe(400);
    });
  });

  describe('orden', () => {
    it('NOMBRE ordena alfabeticamente, KARMA de mayor a menor', async () => {
      expect(nombres(await pedir('orden=NOMBRE'))).toEqual(['Admin', 'Lucia', 'Pedro']);
      expect(nombres(await pedir('orden=KARMA'))).toEqual(['Pedro', 'Lucia', 'Admin']);
    });
    it('RECIENTES es el valor por defecto', async () => {
      expect(nombres(await pedir())).toEqual(nombres(await pedir('orden=RECIENTES')));
    });
    it('400 con un orden desconocido', async () => {
      expect((await pedir('orden=EDAD')).status).toBe(400);
    });
  });

  describe('page y size', () => {
    it('size=1 pagina: total 3, 3 paginas', async () => {
      const res = await pedir('orden=NOMBRE&page=2&size=1');
      expect(nombres(res)).toEqual(['Lucia']);
      expect(res.body.data).toMatchObject({ page: 2, size: 1, total: 3, totalPaginas: 3 });
    });
    it('una pagina mas alla del final es 200 con items vacios y el total real', async () => {
      const res = await pedir('page=9&size=1');
      expect(res.body.data).toMatchObject({ items: [], total: 3 });
    });
    it.each([['page=0'], ['page=-1'], ['page=x'], ['size=0'], ['size=51'], ['size=1.5']])('400 con %s', async (consulta) => {
      expect((await pedir(consulta)).status).toBe(400);
    });
    it.each([['size=1'], ['size=50'], ['page=1']])('200 en el limite: %s', async (consulta) => {
      expect((await pedir(consulta)).status).toBe(200);
    });
  });

  describe('acceso', () => {
    it('401 NO_AUTENTICADO sin token', async () => {
      const res = await request(app).get('/api/admin/usuarios');
      expect([res.status, res.body.code]).toEqual([401, 'NO_AUTENTICADO']);
    });
    it('403 ACCESO_DENEGADO con un usuario no admin', async () => {
      const usuario = ctx.usuarioDAO.agregar(aUsuario());
      const res = await request(app).get('/api/admin/usuarios').set(cabeceraDe(usuario));
      expect([res.status, res.body.code]).toEqual([403, 'ACCESO_DENEGADO']);
    });
  });
});
