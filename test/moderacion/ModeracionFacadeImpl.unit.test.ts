/** ModeracionFacadeImpl unit tests (rubric M6, >= 4 cases): reactivation, user directory and the report review queue. */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { contextoReporteDesde } from '../../src/dao/ContextoReporteDAO.js';
import { EstadoCuenta } from '../../src/enum/EstadoCuenta.js';
import { EstadoReporte } from '../../src/enum/EstadoReporte.js';
import { SinDenunciasPendientesException } from '../../src/exception/moderacion/SinDenunciasPendientesException.js';
import { UsuarioNoSuspendidoException } from '../../src/exception/moderacion/UsuarioNoSuspendidoException.js';
import { ReporteNoEncontradoException } from '../../src/exception/reporte/ReporteNoEncontradoException.js';
import { UsuarioNoEncontradoException } from '../../src/exception/usuario/UsuarioNoEncontradoException.js';
import { ModeracionFacadeImpl } from '../../src/facade/impl/ModeracionFacadeImpl.js';
import { AHORA, MS_DIA, armarModeracion } from './entornoModeracion.js';

describe('ModeracionFacadeImpl', () => {
  let m: ReturnType<typeof armarModeracion>;
  beforeEach(() => {
    m = armarModeracion();
  });
  const pagina = { page: 1, size: 20 };

  describe('reactivar (HU 7.4)', () => {
    it('levanta la sancion vigente y deja la cuenta ACTIVO (S20)', async () => {
      const { usuario } = await m.suspendido(7);
      await m.facade.reactivar(m.admin().id, usuario.id);
      expect((await m.usuarioDAO.buscarPorId(usuario.id))?.status).toBe(EstadoCuenta.ACTIVO);
      expect(await m.sancionDAO.buscarVigente(usuario.id, AHORA)).toBeNull();
    });

    it('un usuario ACTIVO: 409 USUARIO_NO_SUSPENDIDO (S22)', async () => {
      await expect(m.facade.reactivar(m.admin().id, m.usuario().id)).rejects.toBeInstanceOf(UsuarioNoSuspendidoException);
    });

    it('usuario inexistente: 404', async () => {
      await expect(m.facade.reactivar(m.admin().id, 9999)).rejects.toBeInstanceOf(UsuarioNoEncontradoException);
    });
  });

  describe('listarUsuarios y obtenerUsuario (HU 7.2)', () => {
    it('pagina con filtro q y status; los suspendidos traen la sancion vigente para "faltan N dias" (S8, S9, S11)', async () => {
      const { usuario } = await m.suspendido(7);
      m.usuario({ nombre: 'Lucia', email: 'lucia@crowdradar.pe' });
      m.usuario({ nombre: 'Pedro', email: 'pedro@crowdradar.pe' });
      const todos = await m.facade.listarUsuarios({}, pagina);
      expect(todos.total).toBeGreaterThanOrEqual(3);
      const porNombre = await m.facade.listarUsuarios({ q: 'lucia' }, pagina);
      expect(porNombre.items.map((i) => i.usuario.nombre)).toEqual(['Lucia']);
      expect(porNombre.items[0]!.sancionVigente).toBeNull();
      const suspendidos = await m.facade.listarUsuarios({ status: EstadoCuenta.SUSPENDIDO }, pagina);
      expect(suspendidos.items).toHaveLength(1);
      expect(suspendidos.items[0]!.usuario.id).toBe(usuario.id);
      expect(suspendidos.items[0]!.sancionVigente?.fechaFin).toEqual(new Date(AHORA.getTime() + 7 * MS_DIA));
    });

    it('detalle con reportes publicados, denunciados recibidos y sancion vigente (S10)', async () => {
      const { autor } = await m.reporteDenunciado(2);
      const detalle = await m.facade.obtenerUsuario(autor.id);
      expect(detalle).toMatchObject({ reportesPublicados: 1, reportesDenunciados: 2, sancionVigente: null });
      expect(detalle.usuario.id).toBe(autor.id);
    });

    it('detalle de un usuario inexistente: 404', async () => {
      await expect(m.facade.obtenerUsuario(9999)).rejects.toBeInstanceOf(UsuarioNoEncontradoException);
    });
  });

  describe('cola de reportes denunciados (HU 7.1)', () => {
    it('lista los reportes con pendientes con lugar y autor, el mas denunciado primero (S1)', async () => {
      const poco = await m.reporteDenunciado(1);
      const mucho = await m.reporteDenunciado(3);
      const lista = await m.facade.listarReportesDenunciados(pagina);
      expect(lista.items.map((i) => [i.reporteId, i.pendientes])).toEqual([
        [mucho.reporte.id, 3],
        [poco.reporte.id, 1],
      ]);
      expect(lista.items[0]).toMatchObject({ lugar: { nombre: 'Parque Kennedy' }, autor: { id: mucho.autor.id } });
    });

    it('sin denuncias pendientes: pagina vacia (S3)', async () => {
      expect((await m.facade.listarReportesDenunciados(pagina)).items).toEqual([]);
    });

    it('lee reporte, lugar y autor de toda la pagina en un solo lote (sin N+1)', async () => {
      const a = await m.reporteDenunciado(1);
      const b = await m.reporteDenunciado(2);
      const contextoReporteDAO = { buscarPorReportes: vi.fn(contextoReporteDesde(m).buscarPorReportes) };
      const facade = new ModeracionFacadeImpl({ ...m.deps, contextoReporteDAO });
      const lista = await facade.listarReportesDenunciados(pagina);
      expect(contextoReporteDAO.buscarPorReportes).toHaveBeenCalledTimes(1);
      expect(contextoReporteDAO.buscarPorReportes).toHaveBeenCalledWith([b.reporte.id, a.reporte.id]);
      expect(lista.items.map((i) => [i.reporte.id, i.lugar.id, i.autor.id])).toEqual([
        [b.reporte.id, b.lugar.id, b.autor.id],
        [a.reporte.id, a.lugar.id, a.autor.id],
      ]);
    });

    it('un reporte listado que ya fue eliminado: 404 como en el detalle', async () => {
      await m.reporteDenunciado(1, { estado: EstadoReporte.ELIMINADO });
      await expect(m.facade.listarReportesDenunciados(pagina)).rejects.toBeInstanceOf(ReporteNoEncontradoException);
    });

    it('detalle con el desglose de motivos (S2) y 404 si no existe', async () => {
      const { reporte, autor } = await m.reporteDenunciado(3);
      const detalle = await m.facade.obtenerReporteDenunciado(reporte.id);
      expect(detalle.pendientes).toBe(3);
      expect(detalle.motivos).toEqual(expect.arrayContaining([{ motivo: 'INFORMACION_FALSA', total: 2 }, { motivo: 'CONTENIDO_INAPROPIADO', total: 1 }]));
      expect(detalle.autor.id).toBe(autor.id);
      await expect(m.facade.obtenerReporteDenunciado(9999)).rejects.toBeInstanceOf(ReporteNoEncontradoException);
    });
  });

  describe('resolverDenuncias (HU 7.1 c3)', () => {
    it('ELIMINAR: reporte ELIMINADO, denuncias resueltas, karma revocado, saturacion recalculada y evento tras confirmar (S4)', async () => {
      const { reporte, lugar, autor } = await m.reporteDenunciado(2);
      const resultado = await m.facade.resolverDenuncias(m.admin().id, reporte.id, 'ELIMINAR', 'Contenido falso');
      expect(resultado).toEqual({ reporteId: reporte.id, estado: EstadoReporte.ELIMINADO, denunciasResueltas: 2 });
      expect((await m.reporteDAO.buscarPorId(reporte.id))?.estado).toBe(EstadoReporte.ELIMINADO);
      expect((await m.denunciaDAO.listarReportesConPendientes(pagina)).total).toBe(0);
      expect(m.karmaService.revocarPorReporteEliminado).toHaveBeenCalledWith(reporte.id, expect.anything());
      expect(m.saturacionService.recalcular).toHaveBeenCalledWith(lugar.id, expect.anything());
      expect(m.subject.eventos).toHaveLength(1);
      expect(m.subject.eventos[0]).toMatchObject({ lugarId: lugar.id, autorId: autor.id });
      expect(m.conexion.transacciones).toBe(1);
    });

    it('MANTENER: el reporte sigue ACTIVO, sin karma ni saturacion ni evento (S5)', async () => {
      const { reporte } = await m.reporteDenunciado(2);
      const resultado = await m.facade.resolverDenuncias(m.admin().id, reporte.id, 'MANTENER', null);
      expect(resultado).toMatchObject({ estado: EstadoReporte.ACTIVO, denunciasResueltas: 2 });
      expect((await m.denunciaDAO.listarReportesConPendientes(pagina)).total).toBe(0);
      expect(m.karmaService.revocarPorReporteEliminado).not.toHaveBeenCalled();
      expect(m.saturacionService.recalcular).not.toHaveBeenCalled();
      expect(m.subject.eventos).toHaveLength(0);
    });

    it('sin pendientes: 409 SIN_DENUNCIAS_PENDIENTES y no toca el reporte (S6)', async () => {
      const { reporte } = await m.reporteDenunciado(0);
      await expect(m.facade.resolverDenuncias(m.admin().id, reporte.id, 'ELIMINAR', null)).rejects.toBeInstanceOf(SinDenunciasPendientesException);
      expect((await m.reporteDAO.buscarPorId(reporte.id))?.estado).toBe(EstadoReporte.ACTIVO);
      expect(m.karmaService.revocarPorReporteEliminado).not.toHaveBeenCalled();
    });

    it('reporte inexistente: 404 (S7)', async () => {
      await expect(m.facade.resolverDenuncias(m.admin().id, 9999, 'MANTENER', null)).rejects.toBeInstanceOf(ReporteNoEncontradoException);
    });

    it('si el nivel del lugar no cambia no hay evento', async () => {
      const { reporte, lugar } = await m.reporteDenunciado(1);
      m.saturacionService.recalcular.mockResolvedValueOnce({ lugarId: lugar.id, anterior: 'MODERADO', nuevo: 'MODERADO', actualizadoEn: AHORA } as never);
      await m.facade.resolverDenuncias(m.admin().id, reporte.id, 'ELIMINAR', null);
      expect(m.subject.eventos).toHaveLength(0);
    });
  });
});
