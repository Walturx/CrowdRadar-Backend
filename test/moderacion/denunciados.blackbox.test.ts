/**
 * Caja negra de HU 7.1 (Revisar reportes denunciados), solo para el administrador.
 * Cinco campos de entrada: page y size (GET /api/admin/reportes-denunciados), reporteId (detalle y resolución)
 * y decision y comentario (POST /api/admin/reportes-denunciados/:reporteId/resolucion).
 * Técnicas: particiones de equivalencia (PV válida, PI inválida) y valores límite (VL). Cada `it` es un caso CN-MOD.
 */
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { EstadoReporte } from '../../src/enum/EstadoReporte.js';
import { Rol } from '../../src/enum/Rol.js';
import { crearContenedorPrueba, type ContenedorPrueba } from '../support/crearContenedorPrueba.js';
import { RelojFijo } from '../support/RelojFijo.js';
import { aReporte, aUsuario } from '../support/fabrica/datos.js';

const AHORA = new Date('2026-10-05T15:00:00Z');

describe('Reportes denunciados: 5 campos (caja negra, HU 7.1)', () => {
  let ctx: ContenedorPrueba;
  let app: ReturnType<typeof createApp>;
  let comoAdmin: Record<string, string>;

  /** A report of another citizen with `denuncias` pending complaints. */
  const reporteDenunciado = async (denuncias = 2) => {
    const autor = ctx.usuarioDAO.agregar(aUsuario({ nombre: 'Autor' }));
    const lugar = ctx.lugarDAO.agregar({ nombre: 'Parque Kennedy' });
    const reporte = ctx.reporteDAO.agregar(aReporte({ usuarioId: autor.id, lugarId: lugar.id }));
    for (let i = 0; i < denuncias; i++) {
      await ctx.denunciaDAO.crear({
        reporteId: reporte.id,
        usuarioId: ctx.usuarioDAO.agregar(aUsuario()).id,
        motivo: 'INFORMACION_FALSA',
        detalle: null,
        fechaHora: AHORA,
      });
    }
    return reporte.id;
  };
  const listar = (consulta: string, cab = comoAdmin) => request(app).get(`/api/admin/reportes-denunciados?${consulta}`).set(cab);
  const detalle = (reporteId: string | number) => request(app).get(`/api/admin/reportes-denunciados/${reporteId}`).set(comoAdmin);
  const resolver = (reporteId: string | number, cuerpo: Record<string, unknown>) =>
    request(app).post(`/api/admin/reportes-denunciados/${reporteId}/resolucion`).set(comoAdmin).send(cuerpo);
  const esperarError = (res: request.Response, status: number, code: string) => {
    expect(res.status).toBe(status);
    expect(res.body.code).toBe(code);
  };

  beforeEach(() => {
    ctx = crearContenedorPrueba({ reloj: new RelojFijo(AHORA) });
    app = createApp(ctx.contenedor);
    const admin = ctx.usuarioDAO.agregar(aUsuario({ rol: Rol.ADMIN }));
    comoAdmin = { Authorization: `Bearer ${ctx.emisorToken.emitir(admin).token}` };
  });

  describe('campos 1 y 2 · page y size (listado)', () => {
    it('CN-MOD-01 · PV · sin parámetros → 200 con page 1, size 20 y el conteo de denuncias de cada reporte', async () => {
      const id = await reporteDenunciado(2);
      const res = await listar('');
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ page: 1, size: 20, total: 1 });
      expect(res.body.data.items).toEqual([expect.objectContaining({ reporteId: id, pendientes: 2 })]);
    });
    it('CN-MOD-02 · PV · sin reportes denunciados → 200 con lista vacía y el mensaje «Sin denuncias pendientes»', async () => {
      const res = await listar('');
      expect(res.status).toBe(200);
      expect(res.body.data.items).toEqual([]);
      expect(res.body.message).toBe('Sin denuncias pendientes');
    });
    it('CN-MOD-03 · VL · page = 0 (mínimo 1) → 400 VALIDACION_FALLIDA', async () => {
      esperarError(await listar('page=0'), 400, 'VALIDACION_FALLIDA');
    });
    it('CN-MOD-04 · VL · size = 1 (mínimo) con 3 denunciados → 200 con 1 item y total 3', async () => {
      for (let i = 0; i < 3; i++) await reporteDenunciado(1);
      const res = await listar('size=1');
      expect(res.status).toBe(200);
      expect(res.body.data.items).toHaveLength(1);
      expect(res.body.data.total).toBe(3);
    });
    it('CN-MOD-05 · VL · size = 50 (máximo) → 200', async () => {
      expect((await listar('size=50')).status).toBe(200);
    });
    it('CN-MOD-06 · VL · size = 51 → 400 VALIDACION_FALLIDA', async () => {
      esperarError(await listar('size=51'), 400, 'VALIDACION_FALLIDA');
    });
    it('CN-MOD-07 · PI · un ciudadano (no admin) pide el listado → 403 ACCESO_DENEGADO', async () => {
      const ciudadano = ctx.usuarioDAO.agregar(aUsuario());
      esperarError(await listar('', { Authorization: `Bearer ${ctx.emisorToken.emitir(ciudadano).token}` }), 403, 'ACCESO_DENEGADO');
    });
  });

  describe('campo 3 · reporteId (detalle y resolución)', () => {
    it('CN-MOD-08 · PV · reporte con denuncias → 200 con el detalle y el desglose de motivos', async () => {
      const id = await reporteDenunciado(2);
      const res = await detalle(id);
      expect(res.status).toBe(200);
      expect(JSON.stringify(res.body.data)).toContain('INFORMACION_FALSA');
    });
    it('CN-MOD-09 · PI · reporte que no existe (999) → 404 REPORTE_NO_ENCONTRADO', async () => {
      esperarError(await detalle(999), 404, 'REPORTE_NO_ENCONTRADO');
    });
    it('CN-MOD-10 · VL · reporteId = 0 → 400 VALIDACION_FALLIDA', async () => {
      esperarError(await detalle(0), 400, 'VALIDACION_FALLIDA');
    });
    it('CN-MOD-11 · PI · reporteId no numérico ("abc") → 400 VALIDACION_FALLIDA', async () => {
      esperarError(await detalle('abc'), 400, 'VALIDACION_FALLIDA');
    });
  });

  describe('campo 4 · decision (resolución)', () => {
    it('CN-MOD-12 · PV · ELIMINAR → 200 y el reporte pasa a ELIMINADO', async () => {
      const id = await reporteDenunciado();
      expect((await resolver(id, { decision: 'ELIMINAR' })).status).toBe(200);
      expect((await ctx.reporteDAO.buscarPorId(id))?.estado).toBe(EstadoReporte.ELIMINADO);
    });
    it('CN-MOD-13 · PV · MANTENER → 200, el reporte sigue ACTIVO y sale del listado', async () => {
      const id = await reporteDenunciado();
      expect((await resolver(id, { decision: 'MANTENER' })).status).toBe(200);
      expect((await ctx.reporteDAO.buscarPorId(id))?.estado).toBe(EstadoReporte.ACTIVO);
      expect((await listar('')).body.data.items).toEqual([]);
    });
    it('CN-MOD-14 · PI · decisión fuera del dominio ("BORRAR") → 400 VALIDACION_FALLIDA', async () => {
      esperarError(await resolver(await reporteDenunciado(), { decision: 'BORRAR' }), 400, 'VALIDACION_FALLIDA');
    });
    it('CN-MOD-15 · PI · sin decisión → 400 VALIDACION_FALLIDA', async () => {
      esperarError(await resolver(await reporteDenunciado(), { comentario: 'Revisado' }), 400, 'VALIDACION_FALLIDA');
    });
    it('CN-MOD-16 · PI · segunda resolución del mismo reporte → 409 SIN_DENUNCIAS_PENDIENTES', async () => {
      const id = await reporteDenunciado();
      await resolver(id, { decision: 'MANTENER' });
      esperarError(await resolver(id, { decision: 'MANTENER' }), 409, 'SIN_DENUNCIAS_PENDIENTES');
    });
  });

  describe('campo 5 · comentario (resolución, opcional)', () => {
    it('CN-MOD-17 · PV · sin comentario → 200', async () => {
      expect((await resolver(await reporteDenunciado(), { decision: 'MANTENER' })).status).toBe(200);
    });
    it('CN-MOD-18 · VL · comentario de 280 caracteres (máximo) → 200', async () => {
      expect((await resolver(await reporteDenunciado(), { decision: 'MANTENER', comentario: 'c'.repeat(280) })).status).toBe(200);
    });
    it('CN-MOD-19 · VL · comentario de 281 caracteres → 400 VALIDACION_FALLIDA', async () => {
      esperarError(await resolver(await reporteDenunciado(), { decision: 'MANTENER', comentario: 'c'.repeat(281) }), 400, 'VALIDACION_FALLIDA');
    });
    it('CN-MOD-20 · PI · campo extra en el cuerpo ("motivo") → 400 VALIDACION_FALLIDA (cuerpo estricto)', async () => {
      esperarError(await resolver(await reporteDenunciado(), { decision: 'MANTENER', motivo: 'x' }), 400, 'VALIDACION_FALLIDA');
    });
  });
});
