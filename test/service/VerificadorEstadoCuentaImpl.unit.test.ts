/** VerificadorEstadoCuentaImpl (C0 minimal version): only ACTIVO accounts pass. */
import { describe, expect, it } from 'vitest';
import { CuentaSuspendidaException } from '../../src/exception/usuario/CuentaSuspendidaException.js';
import { EstadoCuenta } from '../../src/enum/EstadoCuenta.js';
import { VerificadorEstadoCuentaImpl } from '../../src/service/impl/VerificadorEstadoCuentaImpl.js';
import { aUsuario } from '../support/fabrica/datos.js';

describe('VerificadorEstadoCuentaImpl.verificar', () => {
  const verificador = new VerificadorEstadoCuentaImpl();

  it('devuelve el mismo usuario cuando esta ACTIVO', async () => {
    const usuario = aUsuario({ status: EstadoCuenta.ACTIVO });
    await expect(verificador.verificar(usuario)).resolves.toBe(usuario);
  });

  it('lanza CuentaSuspendidaException (403 CUENTA_SUSPENDIDA) cuando esta SUSPENDIDO', async () => {
    const usuario = aUsuario({ status: EstadoCuenta.SUSPENDIDO });
    const error = await verificador.verificar(usuario).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(CuentaSuspendidaException);
    expect(error).toMatchObject({ status: 403, code: 'CUENTA_SUSPENDIDA', message: 'Tu cuenta está suspendida.' });
  });
});
