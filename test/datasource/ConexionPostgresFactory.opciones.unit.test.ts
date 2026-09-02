/** Sequelize options built from configuration: explicit pool, statement_timeout and verified TLS (R4-203, R1-209). */
import { describe, expect, it } from 'vitest';
import { opcionesSequelize } from '../../src/datasource/impl/ConexionPostgresFactory.js';
import { configPrueba } from '../support/configPrueba.js';
import { crearLoggerSilencioso } from '../support/LoggerSilencioso.js';

const opciones = (env = {}) => opcionesSequelize(configPrueba(env).bd, crearLoggerSilencioso());

describe('opcionesSequelize', () => {
  it('conexion basica: dialecto postgres, nombres underscored y tablas congeladas', () => {
    expect(opciones({ DB_HOST: 'bd.interna', DB_PUERTO: 6543 })).toMatchObject({
      dialect: 'postgres',
      host: 'bd.interna',
      port: 6543,
      define: { underscored: true, freezeTableName: true },
    });
  });

  it('pool explicito {max, min, acquire, idle} desde la configuracion', () => {
    const o = opciones({ DB_POOL_MAX: 4, DB_POOL_MIN: 1, DB_POOL_ACQUIRE_MS: 5000, DB_POOL_IDLE_MS: 2000 });
    expect(o.pool).toEqual({ max: 4, min: 1, acquire: 5000, idle: 2000 });
  });

  it('statement_timeout del servidor tomado de la configuracion', () => {
    expect(opciones({ DB_STATEMENT_TIMEOUT_MS: 7000 }).dialectOptions).toMatchObject({ statement_timeout: 7000 });
  });

  it('sin DB_SSL no se activa TLS', () => {
    expect(opciones().dialectOptions).not.toHaveProperty('ssl');
  });

  it('con DB_SSL=true el certificado del servidor se VERIFICA (rejectUnauthorized true)', () => {
    const ssl = (opciones({ DB_SSL: 'true' }).dialectOptions as { ssl: { require: boolean; rejectUnauthorized: boolean } }).ssl;
    expect(ssl).toEqual({ require: true, rejectUnauthorized: true });
  });

  it('el logger de SQL no recibe valores enlazados', () => {
    const lineas: string[] = [];
    const o = opcionesSequelize(configPrueba().bd, {
      debug: (obj: { sql: string }) => void lineas.push(obj.sql),
    } as never);
    (o.logging as (sql: string) => void)("INSERT INTO usuario (email) VALUES ('ana@secreto.pe')");
    expect(lineas.join('')).not.toContain('secreto');
  });
});
