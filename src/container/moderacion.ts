import { ModeracionController } from '../controller/ModeracionController.js';
import type { ContextoReporteDAO } from '../dao/ContextoReporteDAO.js';
import type { DenunciaDAO } from '../dao/DenunciaDAO.js';
import { ModeracionFacadeImpl } from '../facade/impl/ModeracionFacadeImpl.js';
import type { ModeracionFacade } from '../facade/ModeracionFacade.js';
import { crearModeracionRouter } from '../route/moderacion.routes.js';
import type { MontajeRuta } from './Contenedor.js';
import type { Infraestructura } from './infraestructura.js';
import { construirServiciosReporte } from './reporte.js';
import { crearEnviadorCorreo } from './seguridad.js';

/**
 * ModeracionFacade over the shared infrastructure. Karma and saturation come from the report stream's wiring (they
 * only revoke and recompute here); the mail goes through the same provider as the recovery links. Without a
 * `contextoReporteDAO` (in-memory compositions) the facade composes it from the entity DAOs.
 */
export function crearModeracionFacade(infra: Infraestructura, denunciaDAO: DenunciaDAO, contextoReporteDAO?: ContextoReporteDAO): ModeracionFacade {
  const { cfg, logger, conexion, reloj, usuarioDAO, sancionDAO, lugarDAO, reporteDAO, subject } = infra;
  const { karmaService, saturacionService } = construirServiciosReporte({ cfg, reloj, logger, conexion, usuarioDAO, lugarDAO, reporteDAO, subject });
  return new ModeracionFacadeImpl({
    usuarioDAO,
    sancionDAO,
    denunciaDAO,
    reporteDAO,
    lugarDAO,
    contextoReporteDAO,
    karmaService,
    saturacionService,
    subject,
    correo: infra.seguridad?.correo ?? crearEnviadorCorreo(cfg, logger),
    conexion,
    reloj,
    logger,
    diasPermitidos: cfg.reglas.suspensionDiasPermitidos,
  });
}

/** Moderation stream (M6), admin chain. */
export function construirModeracion(infra: Infraestructura, denunciaDAO: DenunciaDAO, contextoReporteDAO?: ContextoReporteDAO): MontajeRuta[] {
  const controller = new ModeracionController(crearModeracionFacade(infra, denunciaDAO, contextoReporteDAO));
  return [{ modulo: 'moderacion', ruta: '/api/admin', router: crearModeracionRouter(infra.guardas, controller) }];
}
