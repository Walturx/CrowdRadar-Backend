import { Sequelize } from 'sequelize';
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
    const { host, puerto, nombre, usuario, password, ssl } = this.bd;
    const sequelize = new Sequelize(nombre, usuario, password, {
      host,
      port: puerto,
      dialect: 'postgres',
      logging: (sql) => this.logger.debug({ sql: sqlSinValores(sql) }, 'sql'),
      define: { underscored: true, freezeTableName: true },
      dialectOptions: ssl ? { ssl: { require: true, rejectUnauthorized: false } } : {},
    });
    initModels(sequelize);
    return new ConexionSequelize(sequelize);
  }
}
