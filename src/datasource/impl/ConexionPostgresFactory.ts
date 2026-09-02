import { Sequelize, type Options } from 'sequelize';
import type { ConfiguracionApp } from '../../config/ConfiguracionApp.js';
import { initModels } from '../../dao/impl/sequelize/model/initModels.js';
import type { Logger } from '../../util/logger.js';
import type { ConexionBD } from '../ConexionBD.js';
import { ConexionFactory } from '../ConexionFactory.js';
import { ConexionSequelize } from './ConexionSequelize.js';

/** Keeps the statement shape for debug logs and drops bound values (they may hold secrets). */
export function sqlSinValores(sql: string): string {
  return sql.split(/ VALUES | SET | WHERE /)[0] ?? sql;
}

/**
 * Sequelize options derived from configuration: explicit pool, server-side statement_timeout
 * and, with DB_SSL, TLS with certificate verification ON (use NODE_EXTRA_CA_CERTS for a private CA).
 */
export function opcionesSequelize(bd: ConfiguracionApp['bd'], logger: Logger): Options {
  return {
    host: bd.host,
    port: bd.puerto,
    dialect: 'postgres',
    logging: (sql) => logger.debug({ sql: sqlSinValores(sql) }, 'sql'),
    define: { underscored: true, freezeTableName: true },
    pool: { max: bd.pool.max, min: bd.pool.min, acquire: bd.pool.acquireMs, idle: bd.pool.idleMs },
    dialectOptions: {
      statement_timeout: bd.statementTimeoutMs,
      ...(bd.ssl ? { ssl: { require: true, rejectUnauthorized: true } } : {}),
    },
  };
}

/**
 * Pattern: Factory Method (concrete creator). Builds the PostgreSQL Sequelize
 * instance (underscored columns, frozen table names), registers the models and
 * wraps it in a ConexionSequelize.
 */
export class ConexionPostgresFactory extends ConexionFactory {
  constructor(
    private readonly bd: ConfiguracionApp['bd'],
    private readonly logger: Logger,
  ) {
    super();
  }

  protected crearConexion(): ConexionBD {
    const sequelize = new Sequelize(this.bd.nombre, this.bd.usuario, this.bd.password, opcionesSequelize(this.bd, this.logger));
    initModels(sequelize);
    return new ConexionSequelize(sequelize);
  }
}
