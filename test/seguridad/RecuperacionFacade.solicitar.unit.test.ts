/**
 * Unit tests of RecuperacionFacadeImpl.solicitar (rubric: unit target of M1, at least 4 cases).
 * Spec M1 R1; HU 2.1 c1-c3. In-memory DAOs, fixed generator and clock; the mail is a spy.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { CuentaNoExisteException } from '../../src/exception/usuario/CuentaNoExisteException.js';
import { AHORA, asentar, crearEntornoRecuperacion, EMAIL, URL_PUBLICA, type EntornoRecuperacion } from './entornoRecuperacion.js';

describe('RecuperacionFacadeImpl.solicitar', () => {
  let e: EntornoRecuperacion;
  beforeEach(() => {
    e = crearEntornoRecuperacion();
  });

  it('unknown email (GENERICA): resolves, creates no token and sends no mail', async () => {
    await expect(e.facade.solicitar('nadie@crowdradar.pe')).resolves.toBeUndefined();
    await asentar();
    expect(e.correo.enviados).toHaveLength(0);
    expect(await e.tokenDAO.buscarPorHash(e.hashDe('tok-1'))).toBeNull();
    expect(e.conexion.transacciones).toBe(0);
  });

  it('known email: stores only the hash, TTL 30 minutes, and mails the link with the plain token', async () => {
    await e.facade.solicitar(EMAIL);
    const guardado = await e.tokenDAO.buscarPorHash(e.hashDe('tok-1'));
    expect(guardado).toMatchObject({ usuarioId: e.usuario.id, usadoEn: null });
    expect(guardado?.expiraEn).toEqual(new Date(AHORA.getTime() + 30 * 60_000));
    expect(await e.tokenDAO.buscarPorHash('tok-1')).toBeNull(); // the plain token is not a stored key
    expect(e.correo.enviados).toHaveLength(1);
    const mensaje = e.correo.enviados[0]!;
    expect(mensaje.para).toBe(EMAIL);
    expect(mensaje.texto).toContain(`${URL_PUBLICA}/recuperar/restablecer?token=tok-1`);
    expect(mensaje.html).toContain(`${URL_PUBLICA}/recuperar/restablecer?token=tok-1`);
  });

  it('honours RECUPERACION_EXPIRA_MIN', async () => {
    e = crearEntornoRecuperacion({ expiraMin: 5 });
    await e.facade.solicitar(EMAIL);
    expect((await e.tokenDAO.buscarPorHash(e.hashDe('tok-1')))?.expiraEn).toEqual(new Date(AHORA.getTime() + 5 * 60_000));
  });

  it('a second request invalidates the first token and leaves one live token', async () => {
    await e.facade.solicitar(EMAIL);
    await e.facade.solicitar(EMAIL);
    expect((await e.tokenDAO.buscarPorHash(e.hashDe('tok-1')))?.usadoEn).toEqual(AHORA);
    expect((await e.tokenDAO.buscarPorHash(e.hashDe('tok-2')))?.usadoEn).toBeNull();
  });

  it('the mail is sent after the transaction commits', async () => {
    await e.facade.solicitar(EMAIL);
    expect(e.conexion.confirmadas).toBe(1);
    expect(e.correo.confirmadasAlEnviar).toEqual([1]);
  });

  it('mail failure: still resolves, logs the failure without the token or the email', async () => {
    e.correo.fallo = new Error(`SMTP caido para ${EMAIL} con tok-1`);
    await expect(e.facade.solicitar(EMAIL)).resolves.toBeUndefined();
    await asentar();
    const volcado = JSON.stringify(e.lineas);
    expect(e.lineas.some((l) => l.level === 50)).toBe(true);
    expect(volcado).not.toContain('tok-1');
    expect(volcado).not.toContain(EMAIL);
  });

  it('DETALLADA and unknown email: CuentaNoExiste (404) and still no token or mail', async () => {
    e = crearEntornoRecuperacion({ politicaMensajes: 'DETALLADA' });
    await expect(e.facade.solicitar('nadie@crowdradar.pe')).rejects.toBeInstanceOf(CuentaNoExisteException);
    expect(e.correo.enviados).toHaveLength(0);
  });

  it('DETALLADA and known email: the same success as GENERICA', async () => {
    e = crearEntornoRecuperacion({ politicaMensajes: 'DETALLADA' });
    await expect(e.facade.solicitar(EMAIL)).resolves.toBeUndefined();
    expect(e.correo.enviados).toHaveLength(1);
  });

  it('writes one audit line per request with the outcome and a masked email', async () => {
    await e.facade.solicitar(EMAIL);
    await e.facade.solicitar('nadie@crowdradar.pe');
    const auditoria = e.lineas.filter((l) => l.evento === 'recuperacion.solicitud');
    expect(auditoria.map((l) => l.resultado)).toEqual(['enviada', 'desconocido']);
    expect(JSON.stringify(auditoria)).not.toContain(EMAIL);
    expect(auditoria[0]!.email).toMatch(/^a\*+@crowdradar\.pe$/);
  });
});
