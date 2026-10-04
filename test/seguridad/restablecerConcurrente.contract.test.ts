/**
 * R3-1304: two concurrent password resets with the SAME token against REAL PostgreSQL (opt-in: DATABASE_URL_TEST).
 * The token is spent by a conditional UPDATE inside the reset transaction, so exactly one reset wins:
 * one 200 and one 400 TOKEN_RECUPERACION_INVALIDO, and the stored password is the winner's.
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
import { ConexionSequelize } from '../../src/datasource/impl/ConexionSequelize.js';
import { crearLoggerSilencioso } from '../support/LoggerSilencioso.js';
import { configPrueba } from '../support/configPrueba.js';
import { CorreoEspia } from '../support/adapter/CorreoEspia.js';
import { LugarDAOMemoria } from '../support/dao/memoria/LugarDAOMemoria.js';
import { ReporteDAOMemoria } from '../support/dao/memoria/ReporteDAOMemoria.js';
import { URL_BD_TEST, consultar, crearBdTemporal, ejecutarCli, type BaseTemporal } from '../support/baseDatos.js';

const registro = { nombre: 'Ana', apellido: 'Perez', email: 'ana@crowdradar.pe', password: 'Vieja1234', telefono: '987654321', distrito: 'Miraflores' };

describe.skipIf(!URL_BD_TEST)('restablecer concurrente (PostgreSQL real)', () => {
  let bd: BaseTemporal;
  let sequelize: Sequelize;

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

  it('dos POST /api/auth/restablecer simultaneos con el mismo token -> un 200 y un 400 TOKEN_RECUPERACION_INVALIDO', async () => {
    const cfg = configPrueba();
    const correo = new CorreoEspia();
    const contenedor = ensamblar({
      cfg,
      logger: crearLoggerSilencioso(),
      conexion: new ConexionSequelize(sequelize),
      usuarioDAO: new UsuarioDAOSequelize(),
      lugarDAO: new LugarDAOMemoria(),
      reporteDAO: new ReporteDAOMemoria(),
      hasher: new BcryptHasherAdapter(cfg.seguridad.bcryptCosto),
      emisorToken: new JwtEmisorTokenAdapter(cfg.seguridad),
      seguridad: { correo },
    });
    const app = createApp(contenedor);
    expect((await request(app).post('/api/auth/register').send(registro)).status).toBe(201);
    expect((await request(app).post('/api/auth/recuperar').send({ email: registro.email })).status).toBe(200);
    await new Promise((resolver) => setTimeout(resolver, 100)); // the mail leaves after the answer
    const token = /token=([^\s"&]+)/.exec(correo.enviados.at(-1)!.texto)![1]!;

    const respuestas = await Promise.all([
      request(app).post('/api/auth/restablecer').send({ token, nuevaPassword: 'GanadoraUno1', confirmarPassword: 'GanadoraUno1' }),
      request(app).post('/api/auth/restablecer').send({ token, nuevaPassword: 'GanadoraDos2', confirmarPassword: 'GanadoraDos2' }),
    ]);

    expect(respuestas.map((r) => r.status).sort()).toEqual([200, 400]);
    const perdedora = respuestas.find((r) => r.status === 400)!;
    expect(perdedora.body.code).toBe('TOKEN_RECUPERACION_INVALIDO');
    const ganadora = respuestas[0]!.status === 200 ? 'GanadoraUno1' : 'GanadoraDos2';
    const login = await request(app).post('/api/auth/login').send({ email: registro.email, password: ganadora });
    expect(login.status).toBe(200);
    expect(await consultar(bd.url, 'SELECT id FROM token_recuperacion WHERE usado_en IS NULL')).toHaveLength(0);
  });
});
