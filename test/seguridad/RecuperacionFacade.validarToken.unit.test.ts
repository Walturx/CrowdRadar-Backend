/** Unit tests of RecuperacionFacadeImpl.validarToken. Spec M1 R2; HU 2.2 c1, c3. */
import { beforeEach, describe, expect, it } from 'vitest';
import { TokenRecuperacionExpiradoException } from '../../src/exception/recuperacion/TokenRecuperacionExpiradoException.js';
import { TokenRecuperacionInvalidoException } from '../../src/exception/recuperacion/TokenRecuperacionInvalidoException.js';
import { crearEntornoRecuperacion, type EntornoRecuperacion } from './entornoRecuperacion.js';

describe('RecuperacionFacadeImpl.validarToken', () => {
  let e: EntornoRecuperacion;
  beforeEach(async () => {
    e = crearEntornoRecuperacion();
    await e.facade.solicitar(e.usuario.email);
  });

  it('resolves for a live token', async () => {
    await expect(e.facade.validarToken('tok-1')).resolves.toBeUndefined();
  });

  it('an unknown token is invalid (400)', async () => {
    await expect(e.facade.validarToken('otro')).rejects.toBeInstanceOf(TokenRecuperacionInvalidoException);
  });

  it('a used token is invalid (400), the same error as an unknown one', async () => {
    const guardado = await e.tokenDAO.buscarPorHash(e.hashDe('tok-1'));
    await e.tokenDAO.marcarUsado(guardado!.id, e.reloj.ahora());
    await expect(e.facade.validarToken('tok-1')).rejects.toBeInstanceOf(TokenRecuperacionInvalidoException);
  });

  it('an expired token is 410, exactly at the expiry instant too', async () => {
    e.reloj.avanzarMinutos(29);
    await expect(e.facade.validarToken('tok-1')).resolves.toBeUndefined();
    e.reloj.avanzarMinutos(1);
    await expect(e.facade.validarToken('tok-1')).rejects.toBeInstanceOf(TokenRecuperacionExpiradoException);
  });

  it('a token invalidated by a newer request is invalid', async () => {
    await e.facade.solicitar(e.usuario.email);
    await expect(e.facade.validarToken('tok-1')).rejects.toBeInstanceOf(TokenRecuperacionInvalidoException);
    await expect(e.facade.validarToken('tok-2')).resolves.toBeUndefined();
  });

  it('does not log the token', async () => {
    await e.facade.validarToken('tok-1');
    await e.facade.validarToken('malo').catch(() => undefined);
    expect(JSON.stringify(e.lineas)).not.toContain('tok-1');
    expect(JSON.stringify(e.lineas)).not.toContain('malo');
  });
});
