/**
 * initModels can run more than once per process: every DAO contract file calls it on its own Sequelize instance, and
 * with the shared module graph (vitest.config.ts) the model classes are the same objects across files. A second call
 * must neither throw (duplicate association alias) nor stack associations. No database: Sequelize only connects on the
 * first query. Listed in ARCHIVOS_AISLADOS because it rebinds the global model classes to a throwaway instance.
 */
import { Sequelize } from 'sequelize';
import { afterAll, describe, expect, it } from 'vitest';
import { initModels } from '../../src/dao/impl/sequelize/model/initModels.js';
import { LugarModel } from '../../src/dao/impl/sequelize/model/LugarModel.js';
import { ReporteModel } from '../../src/dao/impl/sequelize/model/ReporteModel.js';
import { UsuarioModel } from '../../src/dao/impl/sequelize/model/UsuarioModel.js';

const sinConexion = () => new Sequelize('postgres://nadie:nada@127.0.0.1:1/ninguna', { dialect: 'postgres', logging: false });

describe('initModels', () => {
  const instancias: Sequelize[] = [];
  afterAll(async () => {
    await Promise.all(instancias.map((s) => s.close()));
  });

  it('dos veces sobre la misma instancia no lanza ni duplica las asociaciones de solo lectura', () => {
    const sequelize = sinConexion();
    instancias.push(sequelize);
    initModels(sequelize);
    expect(() => initModels(sequelize)).not.toThrow();
    expect(Object.keys(ReporteModel.associations).sort()).toEqual(['autor', 'lugar']);
    expect(ReporteModel.associations.lugar?.target).toBe(LugarModel);
    expect(ReporteModel.associations.autor?.target).toBe(UsuarioModel);
  });

  it('sobre otra instancia vuelve a enlazar los modelos a esa instancia', () => {
    const otra = sinConexion();
    instancias.push(otra);
    initModels(otra);
    expect(ReporteModel.sequelize).toBe(otra);
    expect(Object.keys(ReporteModel.associations).sort()).toEqual(['autor', 'lugar']);
  });
});
