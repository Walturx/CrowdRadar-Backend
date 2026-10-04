import type { RequestHandler } from 'express';
import type { EmisorToken } from '../adapter/seguridad/EmisorToken.js';
import type { Hasher } from '../adapter/seguridad/Hasher.js';
import type { ConfiguracionApp } from '../config/ConfiguracionApp.js';
import type { UsuarioDAO } from '../dao/UsuarioDAO.js';
import type { ConexionBD } from '../datasource/ConexionBD.js';
import { Rol } from '../enum/Rol.js';
import { crearAutenticar } from '../middleware/autenticar.js';
import { requerirRol } from '../middleware/requerirRol.js';
import type { MiddlewareRuta } from '../route/middlewareRuta.js';
import { crearSistemaRouter } from '../route/sistema.routes.js';
import { VerificadorEstadoCuentaImpl } from '../service/impl/VerificadorEstadoCuentaImpl.js';
import type { VerificadorEstadoCuenta } from '../service/VerificadorEstadoCuenta.js';
import { EstadoServicio } from '../util/EstadoServicio.js';
import type { Logger } from '../util/logger.js';
import { relojSistema, type Reloj } from '../util/Reloj.js';
import type { MontajeRuta } from './Contenedor.js';
import type { DependenciasLugar } from './lugar.js';

/** Ports every stream builder may use. Streams add their own DAOs in their builder, never here. */
export interface DependenciasInfraestructura {
  cfg: ConfiguracionApp;
  logger: Logger;
  conexion: ConexionBD;
  usuarioDAO: UsuarioDAO;
  hasher: Hasher;
  emisorToken: EmisorToken;
  /** Places-stream ports to replace (tests); omitted ones are built by `container/lugar.ts`. */
  lugar?: Partial<DependenciasLugar>;
  /** Readiness flag shared with the shutdown; a fresh one when omitted (tests). */
  estado?: EstadoServicio;
}

export interface Infraestructura extends Omit<DependenciasInfraestructura, 'estado'> {
  estado: EstadoServicio;
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
