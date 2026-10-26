import type { RequestHandler } from 'express';
import type { EmisorToken } from '../adapter/seguridad/EmisorToken.js';
import type { Hasher } from '../adapter/seguridad/Hasher.js';
import type { ConfiguracionApp } from '../config/ConfiguracionApp.js';
import type { UsuarioDAO } from '../dao/UsuarioDAO.js';
import type { ConexionBD } from '../datasource/ConexionBD.js';
import { Rol } from '../enum/Rol.js';
import { crearAutenticar } from '../middleware/autenticar.js';
import { requerirRol } from '../middleware/requerirRol.js';
import { PublicadorSaturacion } from '../pattern/observer/PublicadorSaturacion.js';
import type { SaturacionSubject } from '../pattern/observer/SaturacionSubject.js';
import type { MiddlewareRuta } from '../route/middlewareRuta.js';
import { crearSistemaRouter } from '../route/sistema.routes.js';
import { VerificadorEstadoCuentaImpl } from '../service/impl/VerificadorEstadoCuentaImpl.js';
import type { VerificadorEstadoCuenta } from '../service/VerificadorEstadoCuenta.js';
import { EstadoServicio } from '../util/EstadoServicio.js';
import type { Logger } from '../util/logger.js';
import { relojSistema, type Reloj } from '../util/Reloj.js';
import type { MontajeRuta } from './Contenedor.js';

/** Ports every stream builder may use. Streams add their own DAOs in their builder, never here. */
export interface DependenciasInfraestructura {
  cfg: ConfiguracionApp;
  logger: Logger;
  conexion: ConexionBD;
  usuarioDAO: UsuarioDAO;
  hasher: Hasher;
  emisorToken: EmisorToken;
  /** Readiness flag shared with the shutdown; a fresh one when omitted (tests). */
  estado?: EstadoServicio;
  /** Saturation-change subject shared by publishers (M4, M6) and subscribers (M3); a new publisher when omitted. */
  subject?: SaturacionSubject;
}

export interface Infraestructura extends Omit<DependenciasInfraestructura, 'estado' | 'subject'> {
  estado: EstadoServicio;
  subject: SaturacionSubject;
  reloj: Reloj;
  verificador: VerificadorEstadoCuenta;
  autenticar: RequestHandler;
  /** Route guards handed to routers (auth chain, admin chain). */
  guardas: MiddlewareRuta;
}

/** Shared pieces built once: clock, account-status check, `autenticar` and the role guard. */
export function construirInfraestructura(dependencias: DependenciasInfraestructura): Infraestructura {
  const verificador = new VerificadorEstadoCuentaImpl();
  const autenticar = crearAutenticar({
    emisorToken: dependencias.emisorToken,
    usuarioDAO: dependencias.usuarioDAO,
    verificador,
  });
  return {
    ...dependencias,
    estado: dependencias.estado ?? new EstadoServicio(),
    subject: dependencias.subject ?? new PublicadorSaturacion(dependencias.logger),
    reloj: relojSistema,
    verificador,
    autenticar,
    guardas: { autenticar, requerirAdmin: requerirRol(Rol.ADMIN) },
  };
}

/** `GET /` and `GET /api/salud`: mounted first, public. */
export function construirSistema({ conexion, estado }: Infraestructura): MontajeRuta[] {
  return [{ modulo: 'sistema', ruta: '/', router: crearSistemaRouter(conexion, estado) }];
}
