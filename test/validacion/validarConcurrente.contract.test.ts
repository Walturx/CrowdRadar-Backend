/**
 * R3-1401, R3-1405: concurrent votes against REAL PostgreSQL (opt-in: DATABASE_URL_TEST). The report row lock
 * serializes the votes of one report (the stored reliability reflects all of them) and the unique index plus the
 * lock turn a double vote of one user into one 201 and one 409.
 */
import { Sequelize } from 'sequelize';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DenunciaDAOSequelize } from '../../src/dao/impl/sequelize/DenunciaDAOSequelize.js';
import { LugarDAOSequelize } from '../../src/dao/impl/sequelize/LugarDAOSequelize.js';
import { initModels } from '../../src/dao/impl/sequelize/model/initModels.js';
import { ReporteDAOSequelize } from '../../src/dao/impl/sequelize/ReporteDAOSequelize.js';
import { UsuarioDAOSequelize } from '../../src/dao/impl/sequelize/UsuarioDAOSequelize.js';
import { ValidacionDAOSequelize } from '../../src/dao/impl/sequelize/ValidacionDAOSequelize.js';
import { ConexionSequelize } from '../../src/datasource/impl/ConexionSequelize.js';
import { NivelSaturacion } from '../../src/enum/NivelSaturacion.js';
import { TipoAccionValidacion } from '../../src/enum/TipoAccionValidacion.js';
import { CodigoError } from '../../src/exception/CodigoError.js';
import { ConfiabilidadSimpleStrategy } from '../../src/pattern/strategy/confiabilidad/impl/ConfiabilidadSimpleStrategy.js';
import { KarmaServiceImpl } from '../../src/service/impl/KarmaServiceImpl.js';
import { ValidacionServiceImpl } from '../../src/service/impl/ValidacionServiceImpl.js';
import { relojSistema } from '../../src/util/Reloj.js';
import { URL_BD_TEST, consultar, crearBdTemporal, ejecutarCli, type BaseTemporal } from '../support/baseDatos.js';
import { crearSembradorSequelize } from '../support/dao/sequelize/SembradorSequelize.js';

describe.skipIf(!URL_BD_TEST)('validar concurrente (PostgreSQL real)', () => {
  let bd: BaseTemporal;
  let sequelize: Sequelize;
  let servicio: ValidacionServiceImpl;
  let sembrador: ReturnType<typeof crearSembradorSequelize>;
  const reporteDAO = new ReporteDAOSequelize();

  beforeAll(async () => {
    bd = await crearBdTemporal(URL_BD_TEST as string);
    const migracion = await ejecutarCli(['db:migrate'], bd.url);
    if (migracion.codigo !== 0) throw new Error(migracion.salida);
    sequelize = new Sequelize(bd.url, { dialect: 'postgres', logging: false, define: { underscored: true, freezeTableName: true } });
    initModels(sequelize);
    sembrador = crearSembradorSequelize(sequelize);
    const usuarioDAO = new UsuarioDAOSequelize();
    const validacionDAO = new ValidacionDAOSequelize();
    servicio = new ValidacionServiceImpl({
      reporteDAO,
      lugarDAO: new LugarDAOSequelize({ limiteMax: 200 }),
      validacionDAO,
      denunciaDAO: new DenunciaDAOSequelize(),
      usuarioDAO,
      karmaService: new KarmaServiceImpl({
        usuarioDAO,
        reporteDAO,
        reloj: relojSistema,
        karmaPorReporte: 10,
        karmaPorValidacion: 2,
        reportesPremiadosPorDia: 5,
        zonaHoraria: 'America/Lima',
        validacionDAO,
        karmaValidacionMaxDia: 20,
      }),
      estrategia: new ConfiabilidadSimpleStrategy({ minVotos: 1, umbralAlta: 70, umbralMedia: 40 }),
      conexion: new ConexionSequelize(sequelize),
      reloj: relojSistema,
      minVotosEstado: 10,
      karmaPorValidacion: 2,
      limiteLugares: 200,
    });
  });

  afterAll(async () => {
    await sequelize?.close();
    await bd?.eliminar();
  });

  const nuevoReporte = async () => {
    const autor = await sembrador.usuario();
    const lugar = await sembrador.lugar();
    return (await reporteDAO.crear({ usuarioId: autor, lugarId: lugar, nivelSaturacion: NivelSaturacion.MODERADO, fechaHora: new Date() })).id;
  };

  it('dos usuarios votan a la vez: el nivel_confiabilidad guardado refleja los dos votos', async () => {
    const reporteId = await nuevoReporte();
    const [a, b] = [await sembrador.usuario(), await sembrador.usuario()];
    await Promise.all([
      servicio.validar(a, reporteId, TipoAccionValidacion.CONFIRMAR),
      servicio.validar(b, reporteId, TipoAccionValidacion.RECHAZAR),
    ]);
    const [fila] = await consultar(bd.url, 'SELECT nivel_confiabilidad FROM reporte_saturacion WHERE id = $1', [reporteId]);
    expect(Number(fila?.nivel_confiabilidad)).toBe(50);
  });

  it('el mismo usuario vota dos veces a la vez: un 201, un 409 y +2 de karma una sola vez', async () => {
    const reporteId = await nuevoReporte();
    const votante = await sembrador.usuario();
    const resultados = await Promise.allSettled([
      servicio.validar(votante, reporteId, TipoAccionValidacion.CONFIRMAR),
      servicio.validar(votante, reporteId, TipoAccionValidacion.CONFIRMAR),
    ]);
    expect(resultados.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const rechazo = resultados.find((r): r is PromiseRejectedResult => r.status === 'rejected');
    expect(rechazo?.reason).toMatchObject({ status: 409, code: CodigoError.VALIDACION_DUPLICADA });
    const [karma] = await consultar(bd.url, 'SELECT puntos_karma FROM usuario WHERE id = $1', [votante]);
    expect(Number(karma?.puntos_karma)).toBe(2);
    expect(await consultar(bd.url, 'SELECT id FROM validacion_reporte WHERE reporte_id = $1', [reporteId])).toHaveLength(1);
  });
});
