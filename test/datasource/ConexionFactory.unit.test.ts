/**
 * ConexionFactory (Factory Method) and ConexionSequelize (adapter over Sequelize).
 * Spec: R-A4.1.
 */
import type { Sequelize } from 'sequelize';
import { describe, expect, it, vi } from 'vitest';
import type { ConexionBD } from '../../src/datasource/ConexionBD.js';
import { ConexionFactory } from '../../src/datasource/ConexionFactory.js';
import { ConexionPostgresFactory, sqlSinValores } from '../../src/datasource/impl/ConexionPostgresFactory.js';
import { ConexionSequelize } from '../../src/datasource/impl/ConexionSequelize.js';
import { crearLogger } from '../../src/util/logger.js';
import { ConexionFalsa } from '../support/ConexionFalsa.js';
import { configPrueba } from '../support/configPrueba.js';

class FabricaFalsa extends ConexionFactory {
  creadas = 0;

  constructor(private readonly conexion: ConexionBD) {
    super();
  }

  protected crearConexion(): ConexionBD {
    this.creadas += 1;
    return this.conexion;
  }
}

describe('ConexionFactory.conectar', () => {
  it('devuelve la ConexionBD creada por la subclase y la verifica una vez', async () => {
    const falsa = new ConexionFalsa();
    const fabrica = new FabricaFalsa(falsa);

    const conexion = await fabrica.conectar();

    expect(conexion).toBe(falsa);
    expect(fabrica.creadas).toBe(1);
    expect(falsa.verificaciones).toBe(1);
  });

  it('cada llamada crea una conexion nueva (no es Singleton)', async () => {
    const fabrica = new FabricaFalsa(new ConexionFalsa());
    await fabrica.conectar();
    await fabrica.conectar();
    expect(fabrica.creadas).toBe(2);
  });

  it('si la verificacion falla, cierra la conexion y propaga el error', async () => {
    const falsa = new ConexionFalsa(new Error('ECONNREFUSED'));
    const fabrica = new FabricaFalsa(falsa);

    await expect(fabrica.conectar()).rejects.toThrow('ECONNREFUSED');
    expect(falsa.cerrada).toBe(true);
  });
});

describe('ConexionSequelize', () => {
  const crearSequelizeFalso = () => {
    const tx = { id: 'tx-1' };
    return {
      tx,
      sequelize: {
        transaction: vi.fn(async (trabajo: (t: unknown) => Promise<unknown>) => trabajo(tx)),
        authenticate: vi.fn(async () => undefined),
        close: vi.fn(async () => undefined),
      },
    };
  };

  it('transaccion entrega la transaccion de Sequelize como contexto opaco y devuelve el resultado', async () => {
    const { sequelize, tx } = crearSequelizeFalso();
    const conexion = new ConexionSequelize(sequelize as unknown as Sequelize);

    const resultado = await conexion.transaccion(async (contexto) => ({ contexto, ok: true }));

    expect(resultado).toEqual({ contexto: tx, ok: true });
    expect(sequelize.transaction).toHaveBeenCalledTimes(1);
  });

  it('transaccion propaga el error del trabajo', async () => {
    const { sequelize } = crearSequelizeFalso();
    const conexion = new ConexionSequelize(sequelize as unknown as Sequelize);
    await expect(conexion.transaccion(async () => Promise.reject(new Error('fallo')))).rejects.toThrow('fallo');
  });

  it('verificar delega en authenticate y propaga su rechazo', async () => {
    const { sequelize } = crearSequelizeFalso();
    const conexion = new ConexionSequelize(sequelize as unknown as Sequelize);
    await conexion.verificar();
    expect(sequelize.authenticate).toHaveBeenCalledTimes(1);

    sequelize.authenticate.mockRejectedValueOnce(new Error('sin conexion'));
    await expect(conexion.verificar()).rejects.toThrow('sin conexion');
  });

  it('cerrar delega en close', async () => {
    const { sequelize } = crearSequelizeFalso();
    await new ConexionSequelize(sequelize as unknown as Sequelize).cerrar();
    expect(sequelize.close).toHaveBeenCalledTimes(1);
  });
});

describe('ConexionPostgresFactory', () => {
  it('conectar falla con un error de conectividad cuando Postgres no responde (puerto cerrado)', async () => {
    const cfg = configPrueba({ DB_HOST: '127.0.0.1', DB_PUERTO: 1 });
    const fabrica = new ConexionPostgresFactory(cfg.bd, crearLogger('silent'));

    const error = await fabrica.conectar().then(
      () => undefined,
      (e: unknown) => e as Error,
    );

    expect(error?.name).toMatch(/^SequelizeConnection/);
  });

  it('sqlSinValores conserva la forma de la sentencia y descarta los valores', () => {
    const sql = "Executing (default): INSERT INTO usuario (email,password_hash) VALUES ('a@b.pe','$2b$secreto')";
    expect(sqlSinValores(sql)).toBe('Executing (default): INSERT INTO usuario (email,password_hash)');
    expect(sqlSinValores("UPDATE usuario SET nombre='X' WHERE id=1")).toBe('UPDATE usuario');
  });
});
