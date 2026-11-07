/**
 * R3-1401, R3-1405: concurrent votes against REAL PostgreSQL (opt-in: DATABASE_URL_TEST). The report row lock
 * serializes the votes of one report (the stored reliability reflects all of them) and the unique index plus the
 * lock turn a double vote of one user into one 201 and one 409. The voter's points (C7) are read inside the same
 * transaction, so a failing read takes the vote back with it.
 */
import { Sequelize } from 'sequelize';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DenunciaDAOSequelize } from '../../src/dao/impl/sequelize/DenunciaDAOSequelize.js';
import { LugarDAOSequelize } from '../../src/dao/impl/sequelize/LugarDAOSequelize.js';
import { PuntajeDAOSequelize } from '../../src/dao/impl/sequelize/PuntajeDAOSequelize.js';
import { initModels } from '../../src/dao/impl/sequelize/model/initModels.js';
import { ReporteDAOSequelize } from '../../src/dao/impl/sequelize/ReporteDAOSequelize.js';
import { UsuarioDAOSequelize } from '../../src/dao/impl/sequelize/UsuarioDAOSequelize.js';
import { ValidacionDAOSequelize } from '../../src/dao/impl/sequelize/ValidacionDAOSequelize.js';
import { ConexionSequelize } from '../../src/datasource/impl/ConexionSequelize.js';
import { NivelSaturacion } from '../../src/enum/NivelSaturacion.js';
import { TipoAccionValidacion } from '../../src/enum/TipoAccionValidacion.js';
import { CodigoError } from '../../src/exception/CodigoError.js';
import { ConfiabilidadSimpleStrategy } from '../../src/pattern/strategy/confiabilidad/impl/ConfiabilidadSimpleStrategy.js';
import { PuntajeServiceImpl } from '../../src/service/impl/PuntajeServiceImpl.js';
import { ValidacionServiceImpl } from '../../src/service/impl/ValidacionServiceImpl.js';
import type { PuntajeService } from '../../src/service/PuntajeService.js';
import { relojSistema } from '../../src/util/Reloj.js';
import { URL_BD_TEST, consultar, crearBdTemporal, ejecutarCli, type BaseTemporal } from '../support/baseDatos.js';
import { crearSembradorSequelize } from '../support/dao/sequelize/SembradorSequelize.js';

/** The same rule as the strategy below (minVotos 1) with 10 votes before VALIDADO or RECHAZADO. */
const REGLA = { minVotos: 1, umbralAlta: 70, umbralMedia: 40, minVotosEstado: 10 };

describe.skipIf(!URL_BD_TEST)('validar concurrente (PostgreSQL real)', () => {
  let bd: BaseTemporal;
  let sequelize: Sequelize;
  let servicio: ValidacionServiceImpl;
  let sembrador: ReturnType<typeof crearSembradorSequelize>;
  const reporteDAO = new ReporteDAOSequelize();
  /** Builds the service under test; `puntajeService` is replaceable to make the points read fail. */
  let armarServicio: (puntajeService?: PuntajeService) => ValidacionServiceImpl;

  beforeAll(async () => {
    bd = await crearBdTemporal(URL_BD_TEST as string);
    const migracion = await ejecutarCli(['db:migrate'], bd.url);
    if (migracion.codigo !== 0) throw new Error(migracion.salida);
    sequelize = new Sequelize(bd.url, { dialect: 'postgres', logging: false, define: { underscored: true, freezeTableName: true } });
    initModels(sequelize);
    sembrador = crearSembradorSequelize(sequelize);
    const usuarioDAO = new UsuarioDAOSequelize();
    const validacionDAO = new ValidacionDAOSequelize();
    const conexion = new ConexionSequelize(sequelize);
    armarServicio = (puntajeService = new PuntajeServiceImpl({ puntajeDAO: new PuntajeDAOSequelize(), regla: REGLA })) =>
      new ValidacionServiceImpl({
        reporteDAO,
        lugarDAO: new LugarDAOSequelize({ limiteMax: 200 }),
        validacionDAO,
        denunciaDAO: new DenunciaDAOSequelize(),
        usuarioDAO,
        puntajeService,
        estrategia: new ConfiabilidadSimpleStrategy(REGLA),
        conexion,
        reloj: relojSistema,
        minVotosEstado: REGLA.minVotosEstado,
        limiteLugares: 200,
      });
    servicio = armarServicio();
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

  it('el mismo usuario vota dos veces a la vez: un 201, un 409 y un solo voto guardado', async () => {
    const reporteId = await nuevoReporte();
    const votante = await sembrador.usuario();
    const resultados = await Promise.allSettled([
      servicio.validar(votante, reporteId, TipoAccionValidacion.CONFIRMAR),
      servicio.validar(votante, reporteId, TipoAccionValidacion.CONFIRMAR),
    ]);
    expect(resultados.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const rechazo = resultados.find((r): r is PromiseRejectedResult => r.status === 'rejected');
    expect(rechazo?.reason).toMatchObject({ status: 409, code: CodigoError.VALIDACION_DUPLICADA });
    const votos = await consultar(bd.url, 'SELECT usuario_id, tipo_accion FROM validacion_reporte WHERE reporte_id = $1', [reporteId]);
    expect(votos).toHaveLength(1);
    expect(votos[0]).toMatchObject({ usuario_id: votante, tipo_accion: TipoAccionValidacion.CONFIRMAR });
  });

  it('el puntaje del votante se lee con su voto ya guardado: el decimo CONFIRMAR devuelve 2 (C7)', async () => {
    const reporteId = await nuevoReporte();
    for (let i = 0; i < 9; i += 1) await servicio.validar(await sembrador.usuario(), reporteId, TipoAccionValidacion.CONFIRMAR);
    const votante = await sembrador.usuario();
    const resultado = await servicio.validar(votante, reporteId, TipoAccionValidacion.CONFIRMAR);
    expect(resultado.confiabilidad.estado).toBe('VALIDADO');
    expect(resultado.usuario).toEqual({ puntos: 2, tier: 'CROWD_BABY' });
  });

  it('si leer el puntaje falla, el voto no queda guardado (la lectura va dentro de la transaccion del voto)', async () => {
    const reporteId = await nuevoReporte();
    const votante = await sembrador.usuario();
    const fallaAlLeer = armarServicio({
      obtener: async () => {
        throw new Error('lectura de puntos caida');
      },
      obtenerVarios: async () => new Map(),
      puntosDeReportes: async () => new Map(),
    });
    await expect(fallaAlLeer.validar(votante, reporteId, TipoAccionValidacion.CONFIRMAR)).rejects.toThrow('lectura de puntos caida');
    expect(await consultar(bd.url, 'SELECT id FROM validacion_reporte WHERE reporte_id = $1', [reporteId])).toEqual([]);
    const [fila] = await consultar(bd.url, 'SELECT nivel_confiabilidad FROM reporte_saturacion WHERE id = $1', [reporteId]);
    expect(fila?.nivel_confiabilidad).toBeNull();
  });
});
