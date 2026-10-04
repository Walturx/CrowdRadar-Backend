import { BcryptHasherAdapter } from '../adapter/seguridad/impl/BcryptHasherAdapter.js';
import { JwtEmisorTokenAdapter } from '../adapter/seguridad/impl/JwtEmisorTokenAdapter.js';
import type { ConfiguracionApp } from '../config/ConfiguracionApp.js';
import { UsuarioDAOSequelize } from '../dao/impl/sequelize/UsuarioDAOSequelize.js';
import { ConexionPostgresFactory } from '../datasource/impl/ConexionPostgresFactory.js';
import type { EstadoServicio } from '../util/EstadoServicio.js';
import type { Logger } from '../util/logger.js';
import type { Contenedor } from './Contenedor.js';
import { construirFavoritoAlerta, type DaosFavoritoAlerta } from './favoritoAlerta.js';
import { construirInfraestructura, construirSistema, type DependenciasInfraestructura } from './infraestructura.js';
import { construirLugar } from './lugar.js';
import { construirModeracion } from './moderacion.js';
import { construirReporte } from './reporte.js';
import { construirSeguridad } from './seguridad.js';
import { construirValidacion } from './validacion.js';

/** Per-stream ports a caller may replace (tests hand in-memory DAOs); production leaves them to the builders. */
export interface OpcionesEnsamblado {
  favoritoAlerta?: DaosFavoritoAlerta;
}

/**
 * Pattern: composition root (manual DI). Production and tests share it; only the ports differ.
 * Each stream owns one builder file and is the only one to edit it. The mount order below is
 * part of the frozen contract: the reports stream precedes the validation stream.
 */
export function ensamblar(dependencias: DependenciasInfraestructura, opciones: OpcionesEnsamblado = {}): Contenedor {
  const infra = construirInfraestructura(dependencias);
  const { cfg, logger, conexion } = infra;
  return {
    conexion,
    logger,
    corsOrigenes: cfg.servidor.corsOrigenes,
    trustProxy: cfg.servidor.trustProxy,
    limiteCuerpo: cfg.servidor.limiteCuerpo,
    rutas: [
      ...construirSistema(infra),
      ...construirSeguridad(infra),
      ...construirLugar(infra),
      ...construirFavoritoAlerta(infra, opciones.favoritoAlerta),
      ...construirReporte(infra),
      ...construirValidacion(infra),
      ...construirModeracion(infra),
    ],
  };
}

/** Production composition: connects to PostgreSQL (fails fast when unreachable) and wires the real adapters. */
export async function crearContenedor(cfg: ConfiguracionApp, logger: Logger, estado?: EstadoServicio): Promise<Contenedor> {
  const conexion = await new ConexionPostgresFactory(cfg.bd, logger).conectar();
  return ensamblar({
    cfg,
    logger,
    conexion,
    estado,
    usuarioDAO: new UsuarioDAOSequelize(),
    hasher: new BcryptHasherAdapter(cfg.seguridad.bcryptCosto),
    emisorToken: new JwtEmisorTokenAdapter(cfg.seguridad),
  });
}
