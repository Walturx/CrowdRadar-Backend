/** API tests of the admin moderation routes except the user listing (see GET-usuarios.blackbox.test.ts). Spec M6 S1-S7, S10, S13-S22. */
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { EstadoCuenta } from '../../src/enum/EstadoCuenta.js';
import { Rol } from '../../src/enum/Rol.js';
import { crearContenedorPrueba, type ContenedorPrueba } from '../support/crearContenedorPrueba.js';
import { RelojFijo } from '../support/RelojFijo.js';
import { aReporte, aUsuario } from '../support/fabrica/datos.js';

const AHORA = new Date('2026-10-05T15:00:00Z');
const MS_DIA = 86_400_000;

describe('rutas admin de moderacion', () => {
  let ctx: ContenedorPrueba;
  let app: ReturnType<typeof createApp>;
  let admin: ReturnType<ContenedorPrueba['usuarioDAO']['agregar']>;
  const cabecera = (u: typeof admin) => ({ Authorization: `Bearer ${ctx.emisorToken.emitir(u).token}` });
  const comoAdmin = () => cabecera(admin);
  const reportar = async (denuncias = 2) => {
    const autor = ctx.usuarioDAO.agregar(aUsuario({ nombre: 'Autor' }));
    const lugar = ctx.lugarDAO.agregar({ nombre: 'Parque Kennedy' });
    const reporte = ctx.reporteDAO.agregar(aReporte({ usuarioId: autor.id, lugarId: lugar.id }));
    for (let i = 0; i < denuncias; i++) {
      await ctx.denunciaDAO.crear({
        reporteId: reporte.id,
        usuarioId: ctx.usuarioDAO.agregar(aUsuario()).id,
        motivo: i === 0 ? 'CONTENIDO_INAPROPIADO' : 'INFORMACION_FALSA',
        detalle: null,
        fechaHora: AHORA,
      });
    }
    return { autor, lugar, reporte };
  };

  beforeEach(() => {
    ctx = crearContenedorPrueba({ reloj: new RelojFijo(AHORA) });
    app = createApp(ctx.contenedor);
    admin = ctx.usuarioDAO.agregar(aUsuario({ rol: Rol.ADMIN }));
  });

  describe('reportes denunciados', () => {
    it('S1: lista los reportes con denuncias pendientes y su conteo', async () => {
      const { reporte } = await reportar(2);
      const res = await request(app).get('/api/admin/reportes-denunciados').set(comoAdmin());
      expect(res.status).toBe(200);
      expect(res.body.data.items).toEqual([
        expect.objectContaining({
          reporteId: reporte.id,
          pendientes: 2,
          lugar: expect.objectContaining({ nombre: 'Parque Kennedy' }),
          autor: expect.objectContaining({ nombre: 'Autor' }),
        }),
      ]);
    });
    it('S3: sin denuncias pendientes responde 200 con items vacios y el mensaje', async () => {
      const res = await request(app).get('/api/admin/reportes-denunciados').set(comoAdmin());
      expect(res.status).toBe(200);
      expect(res.body.data.items).toEqual([]);
      expect(res.body.message).toBe('Sin denuncias pendientes');
    });
    it('S2: el detalle trae el desglose de motivos y el autor', async () => {
      const { reporte } = await reportar(2);
      const res = await request(app).get(`/api/admin/reportes-denunciados/${reporte.id}`).set(comoAdmin());
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ reporteId: reporte.id, pendientes: 2, autor: { nombre: 'Autor' } });
      expect(res.body.data.motivos).toEqual(
        expect.arrayContaining([
          { motivo: 'CONTENIDO_INAPROPIADO', total: 1 },
          { motivo: 'INFORMACION_FALSA', total: 1 },
        ]),
      );
      expect(JSON.stringify(res.body)).not.toMatch(/password|hash/i);
    });
    it('404 REPORTE_NO_ENCONTRADO con un reporte inexistente', async () => {
      const res = await request(app).get('/api/admin/reportes-denunciados/999').set(comoAdmin());
      expect([res.status, res.body.code]).toEqual([404, 'REPORTE_NO_ENCONTRADO']);
    });
    it('S4: ELIMINAR elimina el reporte y resuelve las denuncias', async () => {
      const { reporte } = await reportar(2);
      const res = await request(app).post(`/api/admin/reportes-denunciados/${reporte.id}/resolucion`).set(comoAdmin()).send({ decision: 'ELIMINAR' });
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual({ reporteId: reporte.id, estado: 'ELIMINADO', denunciasResueltas: 2 });
    });
    it('S5: MANTENER conserva el reporte', async () => {
      const { reporte } = await reportar(1);
      const res = await request(app)
        .post(`/api/admin/reportes-denunciados/${reporte.id}/resolucion`)
        .set(comoAdmin())
        .send({ decision: 'MANTENER', comentario: 'Es veraz' });
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ estado: 'ACTIVO', denunciasResueltas: 1 });
    });
    it('S6: una segunda resolucion es 409 SIN_DENUNCIAS_PENDIENTES', async () => {
      const { reporte } = await reportar(1);
      const url = `/api/admin/reportes-denunciados/${reporte.id}/resolucion`;
      await request(app).post(url).set(comoAdmin()).send({ decision: 'MANTENER' });
      const res = await request(app).post(url).set(comoAdmin()).send({ decision: 'MANTENER' });
      expect([res.status, res.body.code]).toEqual([409, 'SIN_DENUNCIAS_PENDIENTES']);
    });
    it('S7: 404 con un reporte desconocido', async () => {
      const res = await request(app).post('/api/admin/reportes-denunciados/999/resolucion').set(comoAdmin()).send({ decision: 'MANTENER' });
      expect(res.status).toBe(404);
    });
    it.each([[{}], [{ decision: 'BORRAR' }], [{ decision: 'MANTENER', otro: 1 }]])('400 con el cuerpo %j', async (cuerpo) => {
      const { reporte } = await reportar(1);
      const res = await request(app).post(`/api/admin/reportes-denunciados/${reporte.id}/resolucion`).set(comoAdmin()).send(cuerpo);
      expect([res.status, res.body.code]).toEqual([400, 'VALIDACION_FALLIDA']);
    });
  });

  describe('usuarios', () => {
    it('S10: el detalle trae los conteos y la sancion vigente', async () => {
      const { autor } = await reportar(2);
      const res = await request(app).get(`/api/admin/usuarios/${autor.id}`).set(comoAdmin());
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ id: autor.id, email: autor.email, status: 'ACTIVO', reportesPublicados: 1, sancionVigente: null });
      expect(res.body.data).toHaveProperty('reportesDenunciados');
      expect(JSON.stringify(res.body)).not.toMatch(/password|hash/i);
    });
    it('404 USUARIO_NO_ENCONTRADO y 400 con un id no numerico', async () => {
      const res = await request(app).get('/api/admin/usuarios/999').set(comoAdmin());
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ message: expect.any(String), code: 'USUARIO_NO_ENCONTRADO', errors: [] });
      expect((await request(app).get('/api/admin/usuarios/abc').set(comoAdmin())).status).toBe(400);
    });

    describe('suspension', () => {
      const suspender = (id: number, cuerpo: object = { dias: 7, motivo: 'Reportes falsos reiterados' }) =>
        request(app).post(`/api/admin/usuarios/${id}/suspension`).set(comoAdmin()).send(cuerpo);

      it('S13: 201 con la sancion; fechaFin = ahora + dias y el usuario queda SUSPENDIDO', async () => {
        const u = ctx.usuarioDAO.agregar(aUsuario());
        const res = await suspender(u.id);
        expect(res.status).toBe(201);
        expect(res.body.data).toMatchObject({
          usuarioId: u.id,
          dias: 7,
          motivo: 'Reportes falsos reiterados',
          fechaFin: new Date(AHORA.getTime() + 7 * MS_DIA).toISOString(),
        });
        expect((await ctx.usuarioDAO.buscarPorId(u.id))?.status).toBe(EstadoCuenta.SUSPENDIDO);
      });
      it('S18: el token del suspendido recibe 403 CUENTA_SUSPENDIDA', async () => {
        const u = ctx.usuarioDAO.agregar(aUsuario());
        await suspender(u.id);
        const res = await request(app).get('/api/users/profile').set(cabecera(u));
        expect([res.status, res.body.code]).toEqual([403, 'CUENTA_SUSPENDIDA']);
      });
      it('S14: 422 OPERACION_NO_PERMITIDA a si mismo o a otro ADMIN', async () => {
        const otro = ctx.usuarioDAO.agregar(aUsuario({ rol: Rol.ADMIN }));
        for (const id of [admin.id, otro.id]) {
          const res = await suspender(id);
          expect([res.status, res.body.code]).toEqual([422, 'OPERACION_NO_PERMITIDA']);
        }
      });
      it('S15: 409 USUARIO_YA_SUSPENDIDO', async () => {
        const u = ctx.usuarioDAO.agregar(aUsuario());
        await suspender(u.id);
        const res = await suspender(u.id);
        expect([res.status, res.body.code]).toEqual([409, 'USUARIO_YA_SUSPENDIDO']);
      });
      it('S16: 400 con dias fuera del conjunto permitido', async () => {
        const u = ctx.usuarioDAO.agregar(aUsuario());
        const res = await suspender(u.id, { dias: 5, motivo: 'Reportes falsos reiterados' });
        expect([res.status, res.body.code]).toEqual([400, 'VALIDACION_FALLIDA']);
      });
      it.each([[{ dias: 7 }], [{ dias: '7', motivo: 'Reportes falsos' }], [{ dias: 7, motivo: 'corto' }], [{ dias: 7, motivo: 'x'.repeat(281) }]])(
        '400 con el cuerpo %j',
        async (cuerpo) => {
          const u = ctx.usuarioDAO.agregar(aUsuario());
          expect((await suspender(u.id, cuerpo)).status).toBe(400);
        },
      );
      it('motivo de 10 y 280 caracteres es valido', async () => {
        for (const largo of [10, 280]) {
          const u = ctx.usuarioDAO.agregar(aUsuario());
          expect((await suspender(u.id, { dias: 3, motivo: 'x'.repeat(largo) })).status).toBe(201);
        }
      });
      it('404 con un usuario inexistente', async () => {
        const res = await suspender(999);
        expect(res.status).toBe(404);
        expect(res.body).toEqual({ message: expect.any(String), code: 'USUARIO_NO_ENCONTRADO', errors: [] });
        expect(await ctx.sancionDAO.buscarVigente(999, new Date())).toBeNull();
      });
    });

    describe('reactivacion', () => {
      it('S20: reactiva al suspendido; S22: reactivar a un activo es 409 USUARIO_NO_SUSPENDIDO', async () => {
        const u = ctx.usuarioDAO.agregar(aUsuario());
        await request(app).post(`/api/admin/usuarios/${u.id}/suspension`).set(comoAdmin()).send({ dias: 3, motivo: 'Reportes falsos reiterados' });
        const ok = await request(app).post(`/api/admin/usuarios/${u.id}/reactivacion`).set(comoAdmin());
        expect(ok.status).toBe(200);
        expect((await ctx.usuarioDAO.buscarPorId(u.id))?.status).toBe(EstadoCuenta.ACTIVO);
        const otra = await request(app).post(`/api/admin/usuarios/${u.id}/reactivacion`).set(comoAdmin());
        expect([otra.status, otra.body.code]).toEqual([409, 'USUARIO_NO_SUSPENDIDO']);
      });
      it('reactiva a un SUSPENDIDO cuya sancion ya vencio (sin sancion vigente que levantar)', async () => {
        const u = ctx.usuarioDAO.agregar(aUsuario({ status: EstadoCuenta.SUSPENDIDO }));
        const res = await request(app).post(`/api/admin/usuarios/${u.id}/reactivacion`).set(comoAdmin());
        expect(res.status).toBe(200);
        expect((await ctx.usuarioDAO.buscarPorId(u.id))?.status).toBe(EstadoCuenta.ACTIVO);
        expect(await ctx.sancionDAO.buscarVigente(u.id, AHORA)).toBeNull();
      });
      it('404 con un usuario inexistente', async () => {
        const res = await request(app).post('/api/admin/usuarios/999/reactivacion').set(comoAdmin());
        expect(res.status).toBe(404);
        expect(res.body).toEqual({ message: expect.any(String), code: 'USUARIO_NO_ENCONTRADO', errors: [] });
      });
    });
  });
});
