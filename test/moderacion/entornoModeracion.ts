/** Shared setup of the ModeracionFacadeImpl tests: in-memory DAOs, spies for mail, karma, saturation and events. */
import { vi } from 'vitest';
import type { Usuario } from '../../src/entity/Usuario.js';
import { EstadoCuenta } from '../../src/enum/EstadoCuenta.js';
import { NivelSaturacion } from '../../src/enum/NivelSaturacion.js';
import { Rol } from '../../src/enum/Rol.js';
import { ModeracionFacadeImpl } from '../../src/facade/impl/ModeracionFacadeImpl.js';
import type { SaturacionCambiadaEvento } from '../../src/pattern/observer/SaturacionCambiadaEvento.js';
import type { SaturacionSubject } from '../../src/pattern/observer/SaturacionSubject.js';
import { ConexionFalsa } from '../support/ConexionFalsa.js';
import { crearLoggerEspia } from '../support/LoggerEspia.js';
import { RelojFijo } from '../support/RelojFijo.js';
import { CorreoEspia } from '../support/adapter/CorreoEspia.js';
import { DenunciaDAOMemoria } from '../support/dao/memoria/DenunciaDAOMemoria.js';
import { LugarDAOMemoria } from '../support/dao/memoria/LugarDAOMemoria.js';
import { ReporteDAOMemoria } from '../support/dao/memoria/ReporteDAOMemoria.js';
import { SancionDAOMemoria } from '../support/dao/memoria/SancionDAOMemoria.js';
import { UsuarioDAOMemoria } from '../support/dao/memoria/UsuarioDAOMemoria.js';
import { aReporte, aUsuario } from '../support/fabrica/datos.js';

export const AHORA = new Date('2026-10-05T14:00:00Z');
export const MS_DIA = 86_400_000;

class SujetoEspia implements SaturacionSubject {
  eventos: SaturacionCambiadaEvento[] = [];
  suscribir(): void {}
  async notificar(evento: SaturacionCambiadaEvento): Promise<void> {
    this.eventos.push(evento);
  }
}

export function armarModeracion(diasPermitidos: readonly number[] = [3, 7, 30]) {
  const reloj = new RelojFijo(AHORA);
  const usuarioDAO = new UsuarioDAOMemoria();
  const sancionDAO = new SancionDAOMemoria({ reloj });
  const autores = new Map<number, number>();
  const denunciaDAO = new DenunciaDAOMemoria({ reloj, autorDe: (reporteId) => autores.get(reporteId) });
  const reporteDAO = new ReporteDAOMemoria({ reloj });
  const lugarDAO = new LugarDAOMemoria({ reloj });
  const correo = new CorreoEspia();
  const subject = new SujetoEspia();
  const conexion = new ConexionFalsa();
  const { logger, lineas } = crearLoggerEspia();
  const karmaService = { otorgarPorReporte: vi.fn(), otorgarPorValidacion: vi.fn(), revocarPorReporteEliminado: vi.fn(async () => undefined) };
  const saturacionService = {
    recalcular: vi.fn(async (lugarId: number) => ({ lugarId, anterior: NivelSaturacion.SATURADO, nuevo: NivelSaturacion.MODERADO, actualizadoEn: AHORA })),
  };
  const deps = {
    usuarioDAO,
    sancionDAO,
    denunciaDAO,
    reporteDAO,
    lugarDAO,
    karmaService,
    saturacionService,
    subject,
    correo,
    conexion,
    reloj,
    logger,
    diasPermitidos,
  };
  const facade = new ModeracionFacadeImpl(deps);
  const usuario = (extra: Partial<Usuario> = {}) => usuarioDAO.agregar(aUsuario(extra));
  const admin = () => usuario({ rol: Rol.ADMIN });
  const suspendido = async (dias = 7) => {
    const u = usuario({ status: EstadoCuenta.SUSPENDIDO });
    const a = admin();
    const sancion = await sancionDAO.crear({ usuarioId: u.id, administradorId: a.id, dias: dias as 3, motivo: 'Reportes falsos', fechaInicio: AHORA, fechaFin: new Date(AHORA.getTime() + dias * MS_DIA) });
    return { usuario: u, sancion };
  };
  /** A report with `n` pending complaints from `n` different users. */
  const reporteDenunciado = async (n = 2, extra: Partial<ReturnType<typeof aReporte>> = {}) => {
    const autor = usuario();
    const lugar = lugarDAO.agregar({ nombre: 'Parque Kennedy' });
    const reporte = reporteDAO.agregar(aReporte({ usuarioId: autor.id, lugarId: lugar.id, puntosOtorgados: 5, ...extra }));
    autores.set(reporte.id, autor.id);
    for (let i = 0; i < n; i++) {
      await denunciaDAO.crear({ reporteId: reporte.id, usuarioId: usuario().id, motivo: i === 0 ? 'CONTENIDO_INAPROPIADO' : 'INFORMACION_FALSA', detalle: null, fechaHora: AHORA });
    }
    return { autor, lugar, reporte };
  };
  return { facade, deps, reloj, usuarioDAO, sancionDAO, denunciaDAO, reporteDAO, lugarDAO, correo, subject, conexion, lineas, karmaService, saturacionService, usuario, admin, suspendido, reporteDenunciado };
}
