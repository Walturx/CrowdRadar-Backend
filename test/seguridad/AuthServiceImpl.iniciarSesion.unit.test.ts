/**
 * Unit tests of AuthServiceImpl.iniciarSesion (rubric: unit target of M1, 5 cases). Spec M1 R9; HU 1.1 c2, c3.
 * ok, unknown email under GENERICA (decoy hash compared), unknown email under DETALLADA, wrong password, suspended.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { EstadoCuenta } from '../../src/enum/EstadoCuenta.js';
import { CodigoError } from '../../src/exception/CodigoError.js';
import { CredencialesInvalidasException } from '../../src/exception/usuario/CredencialesInvalidasException.js';
import { CuentaNoExisteException } from '../../src/exception/usuario/CuentaNoExisteException.js';
import { CuentaSuspendidaException } from '../../src/exception/usuario/CuentaSuspendidaException.js';
import { AuthServiceImpl } from '../../src/service/impl/AuthServiceImpl.js';
import { sancionVigente, verificadorMemoria } from '../support/cuentaSuspendida.js';
import { EmisorTokenFalso } from '../support/adapter/EmisorTokenFalso.js';
import { HasherFalso } from '../support/adapter/HasherFalso.js';
import { UsuarioDAOMemoria } from '../support/dao/memoria/UsuarioDAOMemoria.js';
import { aUsuario } from '../support/fabrica/datos.js';

const EMAIL = 'ana.ruiz@crowdradar.pe';
const PASSWORD = 'Secreta123';

describe('AuthServiceImpl.iniciarSesion (rubrica M1)', () => {
  let dao: UsuarioDAOMemoria;
  let hasher: HasherFalso;
  let cuenta: ReturnType<typeof verificadorMemoria>;
  const servicio = (politicaMensajes: 'GENERICA' | 'DETALLADA') =>
    new AuthServiceImpl({ usuarioDAO: dao, hasher, emisorToken: new EmisorTokenFalso(), verificador: cuenta.verificador, politicaMensajes });
  const intentar = (s: AuthServiceImpl, email: string, password: string) => s.iniciarSesion({ email, password }).catch((e: unknown) => e);

  beforeEach(() => {
    dao = new UsuarioDAOMemoria();
    cuenta = verificadorMemoria(dao);
    hasher = new HasherFalso();
    dao.agregar(aUsuario({ email: EMAIL, passwordHash: `hash:${PASSWORD}` }));
  });

  it('1. credenciales correctas: devuelve la sesion con el token y el usuario', async () => {
    const sesion = await servicio('GENERICA').iniciarSesion({ email: EMAIL, password: PASSWORD });
    expect(sesion.token).toEqual(expect.any(String));
    expect(sesion.user.email).toBe(EMAIL);
  });

  it('2. email desconocido (GENERICA): CredencialesInvalidas idem a una password mala y compara contra el hash senuelo', async () => {
    const s = servicio('GENERICA');
    const mala = await intentar(s, EMAIL, 'Otra12345');
    hasher.comparaciones = 0;
    const desconocido = await intentar(s, 'nadie@crowdradar.pe', PASSWORD);
    expect(desconocido).toBeInstanceOf(CredencialesInvalidasException);
    expect((desconocido as CredencialesInvalidasException).message).toBe((mala as CredencialesInvalidasException).message);
    expect((desconocido as CredencialesInvalidasException).code).toBe(CodigoError.CREDENCIALES_INVALIDAS);
    expect(hasher.comparaciones).toBe(1);
  });

  it('3. email desconocido (DETALLADA): CuentaNoExiste (404) y tambien compara el hash senuelo', async () => {
    hasher.comparaciones = 0;
    const error = await intentar(servicio('DETALLADA'), 'nadie@crowdradar.pe', PASSWORD);
    expect(error).toBeInstanceOf(CuentaNoExisteException);
    expect((error as CuentaNoExisteException).status).toBe(404);
    expect(hasher.comparaciones).toBe(1);
  });

  it('4. password incorrecta: CredencialesInvalidas (401), con cualquiera de las dos politicas', async () => {
    for (const politica of ['GENERICA', 'DETALLADA'] as const) {
      const error = await intentar(servicio(politica), EMAIL, 'Otra12345');
      expect(error).toBeInstanceOf(CredencialesInvalidasException);
      expect((error as CredencialesInvalidasException).status).toBe(401);
    }
  });

  it('5. cuenta suspendida con la password correcta: CuentaSuspendida (403)', async () => {
    const susp = dao.agregar(aUsuario({ email: 'susp@crowdradar.pe', passwordHash: `hash:${PASSWORD}`, status: EstadoCuenta.SUSPENDIDO }));
    await sancionVigente(cuenta.sancionDAO, susp.id);
    const error = await intentar(servicio('GENERICA'), 'susp@crowdradar.pe', PASSWORD);
    expect(error).toBeInstanceOf(CuentaSuspendidaException);
    expect((error as CuentaSuspendidaException).status).toBe(403);
  });

  it('una cuenta suspendida con password incorrecta no revela el estado (CredencialesInvalidas)', async () => {
    dao.agregar(aUsuario({ email: 'susp@crowdradar.pe', passwordHash: `hash:${PASSWORD}`, status: EstadoCuenta.SUSPENDIDO }));
    expect(await intentar(servicio('GENERICA'), 'susp@crowdradar.pe', 'Otra12345')).toBeInstanceOf(CredencialesInvalidasException);
  });
});
