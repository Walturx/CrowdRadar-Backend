/**
 * Unit tests of AuthServiceImpl (design 4.1; spec R-B1, R-B2): register, login happy path,
 * anti-enumeration (GENERICA vs DETALLADA), decoy hash comparison, suspended accounts.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { CodigoError } from '../../src/exception/CodigoError.js';
import { CredencialesInvalidasException } from '../../src/exception/usuario/CredencialesInvalidasException.js';
import { CuentaNoExisteException } from '../../src/exception/usuario/CuentaNoExisteException.js';
import { CuentaSuspendidaException } from '../../src/exception/usuario/CuentaSuspendidaException.js';
import { EmailYaRegistradoException } from '../../src/exception/usuario/EmailYaRegistradoException.js';
import { EstadoCuenta } from '../../src/enum/EstadoCuenta.js';
import { AuthServiceImpl } from '../../src/service/impl/AuthServiceImpl.js';
import { sancionVigente, verificadorMemoria } from '../support/cuentaSuspendida.js';
import { EmisorTokenFalso } from '../support/adapter/EmisorTokenFalso.js';
import { HasherFalso } from '../support/adapter/HasherFalso.js';
import { UsuarioDAOMemoria } from '../support/dao/memoria/UsuarioDAOMemoria.js';

const registro = {
  nombre: 'Ana',
  apellido: 'Perez',
  email: 'ana@crowdradar.pe',
  password: 'Secreta123',
  telefono: '987654321',
  distrito: 'Miraflores',
};

describe('AuthServiceImpl', () => {
  let dao: UsuarioDAOMemoria;
  let hasher: HasherFalso;
  let cuenta: ReturnType<typeof verificadorMemoria>;
  const crear = (politicaMensajes: 'GENERICA' | 'DETALLADA' = 'GENERICA') =>
    new AuthServiceImpl({
      usuarioDAO: dao,
      hasher,
      emisorToken: new EmisorTokenFalso(),
      verificador: cuenta.verificador,
      politicaMensajes,
    });

  beforeEach(() => {
    dao = new UsuarioDAOMemoria();
    cuenta = verificadorMemoria(dao);
    hasher = new HasherFalso();
  });

  describe('registrar: concurrencia (R3-403)', () => {
    it('dos registros simultaneos con el mismo email: exactamente uno entra y el otro es EmailYaRegistrado', async () => {
      const servicio = crear();
      const resultados = await Promise.allSettled([servicio.registrar(registro), servicio.registrar({ ...registro, email: 'ANA@crowdradar.pe' })]);
      const aceptados = resultados.filter((r) => r.status === 'fulfilled');
      const rechazados = resultados.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
      expect(aceptados).toHaveLength(1);
      expect(rechazados).toHaveLength(1);
      expect(rechazados[0]?.reason).toBeInstanceOf(EmailYaRegistradoException);
      expect((await dao.listar({}, { page: 1, size: 10 })).total).toBe(1);
    });
  });

  describe('registrar', () => {
    it('guarda la cuenta con el hash (nunca la password) y devuelve token y usuario publico', async () => {
      const sesion = await crear().registrar(registro);

      expect(sesion.token).toBeTruthy();
      expect(sesion.user).toMatchObject({ email: 'ana@crowdradar.pe', rol: 'USUARIO', status: 'ACTIVO', telefono: '987654321' });
      expect(JSON.stringify(sesion)).not.toContain('hash:');
      const guardado = await dao.buscarPorEmail('ana@crowdradar.pe');
      expect(guardado?.passwordHash).toBe('hash:Secreta123');
    });

    it('un correo repetido lanza EmailYaRegistradoException (409 EMAIL_DUPLICADO)', async () => {
      const servicio = crear();
      await servicio.registrar(registro);
      const error = await servicio.registrar(registro).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(EmailYaRegistradoException);
      expect((error as EmailYaRegistradoException).code).toBe(CodigoError.EMAIL_DUPLICADO);
    });
  });

  describe('iniciarSesion', () => {
    beforeEach(async () => {
      await crear().registrar(registro);
      hasher.comparaciones = 0;
    });

    it('con credenciales correctas devuelve token y usuario', async () => {
      const sesion = await crear().iniciarSesion({ email: 'ana@crowdradar.pe', password: 'Secreta123' });
      expect(sesion.token).toBe(`token-de-${sesion.user.id}`);
      expect(sesion.user.email).toBe('ana@crowdradar.pe');
    });

    it('password incorrecta lanza CredencialesInvalidas', async () => {
      const error = await crear()
        .iniciarSesion({ email: 'ana@crowdradar.pe', password: 'Otra12345' })
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(CredencialesInvalidasException);
    });

    it('email desconocido (GENERICA) lanza la MISMA excepcion y mensaje que password incorrecta', async () => {
      const servicio = crear('GENERICA');
      const mala = await servicio.iniciarSesion({ email: 'ana@crowdradar.pe', password: 'Otra12345' }).catch((e: unknown) => e);
      const desconocido = await servicio.iniciarSesion({ email: 'nadie@crowdradar.pe', password: 'Secreta123' }).catch((e: unknown) => e);
      expect(desconocido).toBeInstanceOf(CredencialesInvalidasException);
      expect((desconocido as Error).message).toBe((mala as Error).message);
      expect((desconocido as CredencialesInvalidasException).code).toBe((mala as CredencialesInvalidasException).code);
    });

    it('email desconocido (DETALLADA) lanza CuentaNoExiste (404)', async () => {
      const error = await crear('DETALLADA')
        .iniciarSesion({ email: 'nadie@crowdradar.pe', password: 'Secreta123' })
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(CuentaNoExisteException);
      expect((error as CuentaNoExisteException).status).toBe(404);
    });

    it.each(['GENERICA', 'DETALLADA'] as const)(
      'ejecuta SIEMPRE una comparacion de hash, tambien con email desconocido (%s): hash senuelo',
      async (politica) => {
        await crear(politica)
          .iniciarSesion({ email: 'nadie@crowdradar.pe', password: 'Secreta123' })
          .catch(() => undefined);
        expect(hasher.comparaciones).toBe(1);
      },
    );

    it('cuenta suspendida con password correcta lanza CuentaSuspendida (403)', async () => {
      const ana = await dao.buscarPorEmail('ana@crowdradar.pe');
      await dao.actualizarStatus(ana!.id, EstadoCuenta.SUSPENDIDO);
      await sancionVigente(cuenta.sancionDAO, ana!.id);
      const error = await crear()
        .iniciarSesion({ email: 'ana@crowdradar.pe', password: 'Secreta123' })
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(CuentaSuspendidaException);
    });

    it('cuenta suspendida con password incorrecta NO revela la suspension (CredencialesInvalidas)', async () => {
      const ana = await dao.buscarPorEmail('ana@crowdradar.pe');
      await dao.actualizarStatus(ana!.id, EstadoCuenta.SUSPENDIDO);
      const error = await crear()
        .iniciarSesion({ email: 'ana@crowdradar.pe', password: 'Otra12345' })
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(CredencialesInvalidasException);
    });

    it('una cuenta sin hash guardado no puede iniciar sesion', async () => {
      const sinHash = await dao.crear({ ...registro, email: 'sinhash@crowdradar.pe', passwordHash: '' });
      dao.agregar({ ...sinHash, passwordHash: null });
      const error = await crear()
        .iniciarSesion({ email: 'sinhash@crowdradar.pe', password: 'Secreta123' })
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(CredencialesInvalidasException);
    });
  });
});
