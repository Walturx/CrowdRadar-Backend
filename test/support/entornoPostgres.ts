/**
 * The real composition root (`ensamblar` with the Sequelize DAOs and ConexionPostgresFactory) over a throwaway PostgreSQL
 * database (DATABASE_URL_TEST), driven through HTTP with supertest. Only seeding uses SQL. Rate limits are lifted so a
 * test can send hundreds of requests from one user.
 */
import { createHash } from 'node:crypto';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { BcryptHasherAdapter } from '../../src/adapter/seguridad/impl/BcryptHasherAdapter.js';
import { JwtEmisorTokenAdapter } from '../../src/adapter/seguridad/impl/JwtEmisorTokenAdapter.js';
import { ensamblar } from '../../src/container/index.js';
import { ContextoReporteDAOSequelize } from '../../src/dao/impl/sequelize/ContextoReporteDAOSequelize.js';
import { LugarDAOSequelize } from '../../src/dao/impl/sequelize/LugarDAOSequelize.js';
import { ReporteDAOSequelize } from '../../src/dao/impl/sequelize/ReporteDAOSequelize.js';
import { UsuarioDAOSequelize } from '../../src/dao/impl/sequelize/UsuarioDAOSequelize.js';
import type { ConexionBD } from '../../src/datasource/ConexionBD.js';
import { ConexionPostgresFactory } from '../../src/datasource/impl/ConexionPostgresFactory.js';
import type { Reloj } from '../../src/util/Reloj.js';
import { URL_BD_TEST, consultar, crearBdTemporal, ejecutarCli, entornoBd, type BaseTemporal } from './baseDatos.js';
import { configPrueba, type SobrescritosEntorno } from './configPrueba.js';
import { crearLoggerSilencioso } from './LoggerSilencioso.js';

export type App = ReturnType<typeof createApp>;

export interface EntornoPostgres {
  bd: BaseTemporal;
  app: App;
  conexion: ConexionBD;
  sql<T extends Record<string, unknown> = Record<string, unknown>>(texto: string, parametros?: unknown[]): Promise<T[]>;
  usuario(opciones?: { nombre?: string; rol?: 'USUARIO' | 'ADMIN' }): Promise<number>;
  lugar(opciones?: { nombre?: string; lat?: number; lng?: number }): Promise<number>;
  /** Report inserted by SQL (skips the cooldown), ACTIVO. */
  reporteSql(autor: number, lugarId: number, fechaHora?: Date, nivel?: string): Promise<number>;
  /** Vote inserted by SQL (skips the service: no reliability recomputation). */
  votoSql(votante: number, reporteId: number, tipo: 'CONFIRMAR' | 'RECHAZAR', fechaHora?: Date): Promise<number>;
  auth(usuarioId: number): Promise<{ Authorization: string }>;
  get(usuarioId: number, ruta: string): Promise<request.Response>;
  post(usuarioId: number, ruta: string, cuerpo?: object): Promise<request.Response>;
  put(usuarioId: number, ruta: string, cuerpo?: object): Promise<request.Response>;
  /** Application tables as the migrations left them (every table but SequelizeMeta), by name. */
  tablas(): Promise<string[]>;
  /** md5 of every row of every application table, ordered by id: equal before and after means nothing was written. */
  huella(): Promise<string>;
  cerrar(): Promise<void>;
}

export async function crearEntornoPostgres(opciones: { reloj?: Reloj; sobrescritos?: SobrescritosEntorno } = {}): Promise<EntornoPostgres> {
  const bd = await crearBdTemporal(URL_BD_TEST as string);
  const migracion = await ejecutarCli(['db:migrate'], bd.url);
  if (migracion.codigo !== 0) throw new Error(migracion.salida);
  const cfg = configPrueba({
    ...(entornoBd(bd.url) as SobrescritosEntorno),
    LIMITE_VALIDACIONES: 100000,
    LIMITE_DENUNCIAS: 100000,
    LIMITE_LOGIN: 100000,
    LIMITE_REGISTRO: 100000,
    DB_POOL_MAX: 20,
    ...opciones.sobrescritos,
  });
  const logger = crearLoggerSilencioso();
  const conexion = await new ConexionPostgresFactory(cfg.bd, logger).conectar();
  const emisorToken = new JwtEmisorTokenAdapter(cfg.seguridad);
  const usuarioDAO = new UsuarioDAOSequelize();
  const contenedor = ensamblar(
    {
      cfg,
      logger,
      conexion,
      usuarioDAO,
      lugarDAO: new LugarDAOSequelize({ limiteMax: cfg.lugares.limiteMax }),
      reporteDAO: new ReporteDAOSequelize(),
      hasher: new BcryptHasherAdapter(cfg.seguridad.bcryptCosto),
      emisorToken,
      ...(opciones.reloj ? { reloj: opciones.reloj } : {}),
    },
    { contextoReporteDAO: new ContextoReporteDAOSequelize() },
  );
  const app = createApp(contenedor);
  let contador = 0;

  const sql = <T extends Record<string, unknown>>(texto: string, parametros: unknown[] = []) => consultar<T>(bd.url, texto, parametros);
  const auth = async (usuarioId: number) => {
    const usuario = await usuarioDAO.buscarPorId(usuarioId);
    if (!usuario) throw new Error(`usuario ${usuarioId} no existe`);
    return { Authorization: `Bearer ${emisorToken.emitir(usuario).token}` };
  };
  const tablas = async () =>
    (await sql<{ tablename: string }>("SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> 'SequelizeMeta' ORDER BY 1")).map(
      (fila) => fila.tablename,
    );

  return {
    bd,
    app,
    conexion,
    sql,
    async usuario({ nombre, rol = 'USUARIO' } = {}) {
      contador += 1;
      const [fila] = await sql<{ id: number }>(
        `INSERT INTO usuario (nombre, apellido, email, rol) VALUES ($1, 'Prueba', $2, $3) RETURNING id`,
        [nombre ?? `Usuario${String(contador).padStart(4, '0')}`, `usuario${contador}@postgres.local`, rol],
      );
      return fila!.id;
    },
    async lugar({ nombre, lat = -12.05, lng = -77.04 } = {}) {
      contador += 1;
      const [fila] = await sql<{ id: number }>(
        `INSERT INTO lugar (nombre, latitud, longitud, categoria, hora_apertura, hora_cierre) VALUES ($1, $2, $3, 'PLAZA', 0, 24) RETURNING id`,
        [nombre ?? `Lugar ${contador}`, lat, lng],
      );
      return fila!.id;
    },
    async reporteSql(autor, lugarId, fechaHora = new Date(), nivel = 'MODERADO') {
      const [fila] = await sql<{ id: number }>(
        `INSERT INTO reporte_saturacion (usuario_id, lugar_id, nivel_saturacion, fecha_hora) VALUES ($1, $2, $3, $4) RETURNING id`,
        [autor, lugarId, nivel, fechaHora],
      );
      return fila!.id;
    },
    async votoSql(votante, reporteId, tipo, fechaHora = new Date()) {
      const [fila] = await sql<{ id: number }>(
        `INSERT INTO validacion_reporte (reporte_id, usuario_id, tipo_accion, fecha_hora) VALUES ($1, $2, $3, $4) RETURNING id`,
        [reporteId, votante, tipo, fechaHora],
      );
      return fila!.id;
    },
    auth,
    async get(usuarioId, ruta) {
      return request(app).get(ruta).set(await auth(usuarioId));
    },
    async post(usuarioId, ruta, cuerpo = {}) {
      return request(app).post(ruta).set(await auth(usuarioId)).send(cuerpo);
    },
    async put(usuarioId, ruta, cuerpo = {}) {
      return request(app).put(ruta).set(await auth(usuarioId)).send(cuerpo);
    },
    tablas,
    async huella() {
      const partes: string[] = [];
      for (const tabla of await tablas()) {
        const filas = await sql(`SELECT * FROM ${tabla} ORDER BY id`);
        partes.push(`${tabla}:${JSON.stringify(filas)}`);
      }
      return createHash('md5').update(partes.join('\n')).digest('hex');
    },
    async cerrar() {
      await conexion.cerrar();
      await bd.eliminar();
    },
  };
}
