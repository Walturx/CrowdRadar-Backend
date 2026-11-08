/** NodemailerCorreoAdapter (CORREO_PROVEEDOR=smtp): maps the port message onto a Nodemailer transport over a TLS-only SMTP connection. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  EnvioCorreoFallidoError,
  NodemailerCorreoAdapter,
  opcionesTransporteSmtp,
  PLAZO_TOTAL_ENVIO_MS,
  type CorreoSaliente,
  type TransporteCorreo,
} from '../../src/adapter/correo/impl/NodemailerCorreoAdapter.js';

class TransporteEspia implements TransporteCorreo {
  readonly enviados: CorreoSaliente[] = [];

  constructor(private readonly fallo?: Error) {}

  async sendMail(correo: CorreoSaliente): Promise<unknown> {
    if (this.fallo) throw this.fallo;
    this.enviados.push(correo);
    return { messageId: '<1@crowdradar.test>' };
  }
}

const remitente = 'CrowdRadar <crowdradar.demo@gmail.com>';
const smtp = { host: 'smtp.gmail.com', puerto: 587, usuario: 'crowdradar.demo@gmail.com', password: 'abcdefghijklmnop' };
const mensaje = {
  para: 'ana@crowdradar.pe',
  asunto: 'Restablece tu contraseña de CrowdRadar',
  html: '<p><a href="https://demo.test/recuperar/restablecer?token=t-1">Elige una nueva contraseña</a></p>',
  texto: 'Usa este enlace: https://demo.test/recuperar/restablecer?token=t-1',
};

describe('NodemailerCorreoAdapter', () => {
  it('sends the message from CORREO_REMITENTE with both the HTML and the plain-text bodies', async () => {
    const transporte = new TransporteEspia();
    await new NodemailerCorreoAdapter(transporte, remitente).enviar(mensaje);
    expect(transporte.enviados).toEqual([{ from: remitente, to: mensaje.para, subject: mensaje.asunto, html: mensaje.html, text: mensaje.texto }]);
  });

  it('rejects with the provider codes only, never the recipient the provider echoed (callers log the whole error)', async () => {
    const respuesta = `553 5.1.3 The recipient address <${mensaje.para}> is not a valid RFC-5321 address`;
    const fallo = Object.assign(new Error(`Can't send mail - all recipients were rejected: ${respuesta}`), {
      code: 'EENVELOPE',
      responseCode: 553,
      response: respuesta,
      rejected: [mensaje.para],
    });
    const error = await new NodemailerCorreoAdapter(new TransporteEspia(fallo), remitente).enviar(mensaje).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(EnvioCorreoFallidoError);
    expect(error).toMatchObject({ name: 'EnvioCorreoFallidoError', codigo: 'EENVELOPE', codigoRespuesta: 553 });
    const visible = [(error as Error).message, (error as Error).stack, JSON.stringify(error)].join('\n');
    expect(visible).not.toContain(mensaje.para);
  });

  it('rejects with an unknown code when the failure is not a Nodemailer error', async () => {
    const error = await new NodemailerCorreoAdapter(new TransporteEspia(new Error('socket hang up')), remitente).enviar(mensaje).catch((e: unknown) => e);
    expect(error).toMatchObject({ codigo: undefined, codigoRespuesta: undefined, message: expect.stringContaining('desconocido') });
  });

  describe('total deadline (the suspension request awaits the mail and SERVIDOR_REQUEST_TIMEOUT_MS defaults to 30 s)', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    const colgado: TransporteCorreo = { sendMail: () => new Promise<never>(() => undefined) };

    it('gives up on a provider that never answers after PLAZO_TOTAL_ENVIO_MS, well below the request timeout', async () => {
      expect(PLAZO_TOTAL_ENVIO_MS).toBeLessThanOrEqual(15_000);
      const envio = new NodemailerCorreoAdapter(colgado, remitente).enviar(mensaje).catch((e: unknown) => e);
      await vi.advanceTimersByTimeAsync(PLAZO_TOTAL_ENVIO_MS - 1);
      let resuelto = false;
      void envio.then(() => (resuelto = true));
      await vi.advanceTimersByTimeAsync(0);
      expect(resuelto).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      expect(await envio).toMatchObject({ name: 'EnvioCorreoFallidoError', codigo: 'ETIMEDOUT', codigoRespuesta: undefined });
    });

    it('accepts a custom deadline', async () => {
      const envio = new NodemailerCorreoAdapter(colgado, remitente, 50).enviar(mensaje).catch((e: unknown) => e);
      await vi.advanceTimersByTimeAsync(50);
      expect(await envio).toBeInstanceOf(EnvioCorreoFallidoError);
    });

    it('leaves no timer behind after a send that succeeds or fails', async () => {
      await new NodemailerCorreoAdapter(new TransporteEspia(), remitente).enviar(mensaje);
      await new NodemailerCorreoAdapter(new TransporteEspia(new Error('x')), remitente).enviar(mensaje).catch(() => undefined);
      expect(vi.getTimerCount()).toBe(0);
    });
  });

  it('desdeSmtp builds the adapter over a real Nodemailer transport without opening a connection', () => {
    expect(NodemailerCorreoAdapter.desdeSmtp(smtp, remitente)).toBeInstanceOf(NodemailerCorreoAdapter);
  });

  it.each([
    ['host', 'SMTP_HOST'],
    ['usuario', 'SMTP_USUARIO'],
    ['password', 'SMTP_PASSWORD'],
  ] as const)('desdeSmtp fails fast when %s is missing or blank (names %s)', (campo, clave) => {
    expect(() => NodemailerCorreoAdapter.desdeSmtp({ ...smtp, [campo]: undefined }, remitente)).toThrow(clave);
    expect(() => NodemailerCorreoAdapter.desdeSmtp({ ...smtp, [campo]: '   ' }, remitente)).toThrow(clave);
  });
});

describe('opcionesTransporteSmtp', () => {
  it('port 465 uses implicit TLS', () => {
    expect(opcionesTransporteSmtp({ ...smtp, puerto: 465 })).toMatchObject({ host: 'smtp.gmail.com', port: 465, secure: true });
  });

  it('any other port must upgrade with STARTTLS, so the credentials never travel in clear text', () => {
    expect(opcionesTransporteSmtp(smtp)).toMatchObject({
      host: 'smtp.gmail.com',
      port: 587,
      secure: false,
      requireTLS: true,
      auth: { user: smtp.usuario, pass: smtp.password },
    });
  });

  it('bounds every wait, so a stalled provider cannot hold the suspension request for minutes', () => {
    const { connectionTimeout, greetingTimeout, socketTimeout } = opcionesTransporteSmtp(smtp);
    for (const espera of [connectionTimeout, greetingTimeout, socketTimeout]) {
      expect(espera).toBeGreaterThan(0);
      expect(espera).toBeLessThanOrEqual(10_000);
    }
  });
});
