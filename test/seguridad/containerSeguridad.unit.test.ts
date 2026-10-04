/** container/seguridad.ts: builds the recovery facade from the shared infrastructure; the M1 ports are replaceable. */
import { describe, expect, it } from 'vitest';
import { ConsolaCorreoAdapter } from '../../src/adapter/correo/impl/ConsolaCorreoAdapter.js';
import { construirInfraestructura } from '../../src/container/infraestructura.js';
import { crearEnviadorCorreo, crearRecuperacionFacade, type DependenciasSeguridad } from '../../src/container/seguridad.js';
import { ConexionFalsa } from '../support/ConexionFalsa.js';
import { configPrueba, type SobrescritosEntorno } from '../support/configPrueba.js';
import { crearLoggerSilencioso } from '../support/LoggerSilencioso.js';
import { CorreoEspia } from '../support/adapter/CorreoEspia.js';
import { EmisorTokenFalso } from '../support/adapter/EmisorTokenFalso.js';
import { GeneradorTokenFijo } from '../support/adapter/GeneradorTokenFijo.js';
import { HasherFalso } from '../support/adapter/HasherFalso.js';
import { LugarDAOMemoria } from '../support/dao/memoria/LugarDAOMemoria.js';
import { ReporteDAOMemoria } from '../support/dao/memoria/ReporteDAOMemoria.js';
import { TokenRecuperacionDAOMemoria } from '../support/dao/memoria/TokenRecuperacionDAOMemoria.js';
import { UsuarioDAOMemoria } from '../support/dao/memoria/UsuarioDAOMemoria.js';
import { aUsuario } from '../support/fabrica/datos.js';

const infra = (cfg: SobrescritosEntorno = {}, seguridad?: Partial<DependenciasSeguridad>, usuarioDAO = new UsuarioDAOMemoria()) =>
  construirInfraestructura({
    lugarDAO: new LugarDAOMemoria(),
    reporteDAO: new ReporteDAOMemoria(),
    cfg: configPrueba(cfg),
    logger: crearLoggerSilencioso(),
    conexion: new ConexionFalsa(),
    usuarioDAO,
    hasher: new HasherFalso(),
    emisorToken: new EmisorTokenFalso(),
    seguridad,
  });

describe('crearRecuperacionFacade', () => {
  it('uses the injected ports and the configuration (URL_PUBLICA, expiry)', async () => {
    const usuarioDAO = new UsuarioDAOMemoria();
    const usuario = usuarioDAO.agregar(aUsuario({ email: 'ana@crowdradar.pe' }));
    const tokenDAO = new TokenRecuperacionDAOMemoria();
    const correo = new CorreoEspia();
    const facade = crearRecuperacionFacade(
      infra({ URL_PUBLICA: 'https://demo.crowdradar.test', RECUPERACION_EXPIRA_MIN: 10 }, { tokenDAO, correo, generador: new GeneradorTokenFijo(['t-1']) }, usuarioDAO),
    );
    await facade.solicitar('ana@crowdradar.pe');
    expect(correo.enviados[0]?.texto).toContain('https://demo.crowdradar.test/recuperar/restablecer?token=t-1');
    const guardado = await tokenDAO.buscarPorHash(new GeneradorTokenFijo([]).hashear('t-1'));
    expect(guardado?.usuarioId).toBe(usuario.id);
    const vida = guardado!.expiraEn.getTime() - guardado!.createdAt.getTime();
    expect(vida).toBeGreaterThan(9 * 60_000);
    expect(vida).toBeLessThanOrEqual(10 * 60_000 + 1000);
  });

  it('honours POLITICA_MENSAJES_AUTH=DETALLADA (unknown email -> 404)', async () => {
    const facade = crearRecuperacionFacade(infra({ POLITICA_MENSAJES_AUTH: 'DETALLADA' }, { tokenDAO: new TokenRecuperacionDAOMemoria(), correo: new CorreoEspia() }));
    await expect(facade.solicitar('nadie@crowdradar.pe')).rejects.toMatchObject({ status: 404, code: 'CUENTA_NO_EXISTE' });
  });
});

describe('crearEnviadorCorreo', () => {
  const logger = crearLoggerSilencioso();

  it('CORREO_PROVEEDOR=consola builds the console adapter', () => {
    expect(crearEnviadorCorreo(configPrueba({ CORREO_PROVEEDOR: 'consola' }).correo, logger)).toBeInstanceOf(ConsolaCorreoAdapter);
  });

  it('CORREO_PROVEEDOR=smtp fails fast until the Nodemailer adapter exists (never falls back to the console silently)', () => {
    const cfg = configPrueba({ CORREO_PROVEEDOR: 'smtp', SMTP_HOST: 'smtp.test', SMTP_PUERTO: 587, SMTP_USUARIO: 'u', SMTP_PASSWORD: 'p' });
    expect(() => crearEnviadorCorreo(cfg.correo, logger)).toThrow(/smtp/i);
  });
});
