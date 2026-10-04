/**
 * R3-403: concurrent registrations of the same email against REAL PostgreSQL (opt-in: DATABASE_URL_TEST).
 * The unique constraint, not an application-level check, decides the winner: exactly one succeeds, the rest
 * get EmailYaRegistradoException, and one row remains.
 */
import { Sequelize } from 'sequelize';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { BcryptHasherAdapter } from '../../src/adapter/seguridad/impl/BcryptHasherAdapter.js';
import { JwtEmisorTokenAdapter } from '../../src/adapter/seguridad/impl/JwtEmisorTokenAdapter.js';
import { ensamblar } from '../../src/container/index.js';
import { UsuarioDAOSequelize } from '../../src/dao/impl/sequelize/UsuarioDAOSequelize.js';
import { initModels } from '../../src/dao/impl/sequelize/model/initModels.js';
import { EmailYaRegistradoException } from '../../src/exception/usuario/EmailYaRegistradoException.js';
import { AuthServiceImpl } from '../../src/service/impl/AuthServiceImpl.js';
import { VerificadorEstadoCuentaImpl } from '../../src/service/impl/VerificadorEstadoCuentaImpl.js';
import { ConexionFalsa } from '../support/ConexionFalsa.js';
import { crearLoggerSilencioso } from '../support/LoggerSilencioso.js';
import { configPrueba } from '../support/configPrueba.js';
import { URL_BD_TEST, consultar, crearBdTemporal, ejecutarCli, type BaseTemporal } from '../support/baseDatos.js';

const registro = {
  nombre: 'Ana',
  apellido: 'Perez',
  email: 'ana@crowdradar.pe',
  password: 'Secreta123',
  telefono: '987654321',
  distrito: 'Miraflores',
};

describe.skipIf(!URL_BD_TEST)('registro concurrente (PostgreSQL real)', () => {
  let bd: BaseTemporal;
  let sequelize: Sequelize;
  const cfg = configPrueba();
  const hasher = new BcryptHasherAdapter(cfg.seguridad.bcryptCosto);
  const emisorToken = new JwtEmisorTokenAdapter(cfg.seguridad);
  const usuarioDAO = new UsuarioDAOSequelize();

  beforeAll(async () => {
    bd = await crearBdTemporal(URL_BD_TEST as string);
    const migracion = await ejecutarCli(['db:migrate'], bd.url);
    if (migracion.codigo !== 0) throw new Error(migracion.salida);
    sequelize = new Sequelize(bd.url, { dialect: 'postgres', logging: false, define: { underscored: true, freezeTableName: true } });
    initModels(sequelize);
  });

  afterAll(async () => {
    await sequelize?.close();
    await bd?.eliminar();
  });

  const filas = (email: string) => consultar(bd.url, 'SELECT id FROM usuario WHERE email = $1', [email]);

  it('servicio: 5 registros simultaneos del mismo email dejan una fila y 4 EmailYaRegistrado', async () => {
    const servicio = new AuthServiceImpl({
      usuarioDAO,
      hasher,
      emisorToken,
      verificador: new VerificadorEstadoCuentaImpl(),
      politicaMensajes: 'GENERICA',
    });
    const email = 'servicio@crowdradar.pe';
    const resultados = await Promise.allSettled(
      Array.from({ length: 5 }, (_, i) => servicio.registrar({ ...registro, email: i % 2 ? email.toUpperCase() : email })),
    );
    expect(resultados.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const rechazos = resultados.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
    expect(rechazos).toHaveLength(4);
    for (const rechazo of rechazos) expect(rechazo.reason).toBeInstanceOf(EmailYaRegistradoException);
    expect(await filas(email)).toHaveLength(1);
  });

  it('HTTP: dos POST /api/auth/register simultaneos -> exactamente un 201 y un 409 EMAIL_DUPLICADO', async () => {
    const contenedor = ensamblar({ cfg, logger: crearLoggerSilencioso(), conexion: new ConexionFalsa(), usuarioDAO, hasher, emisorToken });
    const app = createApp(contenedor);
    const email = 'http@crowdradar.pe';
    const respuestas = await Promise.all([
      request(app).post('/api/auth/register').send({ ...registro, email }),
      request(app).post('/api/auth/register').send({ ...registro, email }),
    ]);
    expect(respuestas.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(respuestas.find((r) => r.status === 409)?.body.code).toBe('EMAIL_DUPLICADO');
    expect(await filas(email)).toHaveLength(1);
  });
});
