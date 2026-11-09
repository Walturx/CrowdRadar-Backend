import nodemailer from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport/index.js';
import type { EnviadorCorreo, MensajeCorreo } from '../EnviadorCorreo.js';

/** One outgoing mail in Nodemailer's shape. */
export interface CorreoSaliente {
  readonly from: string;
  readonly to: string;
  readonly subject: string;
  readonly html: string;
  readonly text: string;
}

/** Narrow view of a Nodemailer transport: the only call the adapter makes. A real `Transporter` satisfies it. */
export interface TransporteCorreo {
  sendMail(correo: CorreoSaliente): Promise<unknown>;
}

/** SMTP settings as ConfiguracionApp exposes them (`cfg.correo.smtp`); the env schema requires them with `smtp`. */
export interface ConfiguracionSmtp {
  readonly host?: string;
  readonly puerto: number;
  readonly usuario?: string;
  readonly password?: string;
}

/**
 * Longest wait (ms) for the TCP connection, the server greeting, and socket inactivity. Nodemailer's defaults reach
 * minutes, and ModeracionFacadeImpl awaits the suspension mail inside the admin request (SERVIDOR_REQUEST_TIMEOUT_MS).
 */
const ESPERA_MAXIMA_MS = 10_000;

/**
 * Longest wait (ms) for one whole send. The per-step limits above can add up to about 30 s, which is the default
 * SERVIDOR_REQUEST_TIMEOUT_MS, so the suspension request could time out before the mail gives up. Past this deadline
 * the adapter rejects with code ETIMEDOUT; Nodemailer's own socket limits still close the abandoned connection.
 * Nodemailer cannot cancel one send, so a slow but progressing exchange may still deliver after that rejection. No
 * caller retries, and a new recovery request only mails another valid link.
 */
export const PLAZO_TOTAL_ENVIO_MS = 15_000;

/**
 * Nodemailer options for an SMTP provider. Port 465 uses implicit TLS; any other port must upgrade with STARTTLS
 * (`requireTLS`), so the credentials never travel in clear text.
 */
export function opcionesTransporteSmtp(smtp: Required<ConfiguracionSmtp>): SMTPTransport.Options {
  const tlsImplicito = smtp.puerto === 465;
  return {
    host: smtp.host,
    port: smtp.puerto,
    secure: tlsImplicito,
    requireTLS: !tlsImplicito,
    auth: { user: smtp.usuario, pass: smtp.password },
    connectionTimeout: ESPERA_MAXIMA_MS,
    greetingTimeout: ESPERA_MAXIMA_MS,
    socketTimeout: ESPERA_MAXIMA_MS,
  };
}

/**
 * Rejection of NodemailerCorreoAdapter. It keeps only Nodemailer's error code (EAUTH, ETIMEDOUT, ETLS, EENVELOPE...)
 * and the SMTP reply code: the provider's own text, `response` and `rejected` may echo the recipient, and callers
 * such as ModeracionFacadeImpl log the whole error.
 */
export class EnvioCorreoFallidoError extends Error {
  override readonly name = 'EnvioCorreoFallidoError';

  /** `tipoOriginal` is the original error's type (TypeError...) when it carries no Nodemailer code: a triage hint. */
  constructor(
    readonly codigo?: string,
    readonly codigoRespuesta?: number,
    readonly tipoOriginal?: string,
  ) {
    super(
      `El proveedor SMTP no aceptó el correo (código ${codigo ?? 'desconocido'}` +
        `${codigoRespuesta ? `, respuesta ${codigoRespuesta}` : ''}${tipoOriginal ? `, error ${tipoOriginal}` : ''}).`,
    );
  }
}

function sinDatosDelDestinatario(error: unknown): EnvioCorreoFallidoError {
  const { code, responseCode } = (typeof error === 'object' && error !== null ? error : {}) as { code?: unknown; responseCode?: unknown };
  const codigo = typeof code === 'string' ? code : undefined;
  const tipoOriginal = codigo === undefined && error instanceof Error ? error.name : undefined;
  return new EnvioCorreoFallidoError(codigo, typeof responseCode === 'number' ? responseCode : undefined, tipoOriginal);
}

/** Trimmed value: a secret pasted with a trailing newline or spaces would otherwise pass here and fail with EAUTH later. */
function exigir(valor: string | undefined, clave: string): string {
  const limpio = valor?.trim();
  if (!limpio) throw new Error(`CORREO_PROVEEDOR=smtp requiere ${clave}.`);
  return limpio;
}

/** Builds the Nodemailer transport; replaceable so tests can see the options without opening a connection. */
export type CrearTransporte = (opciones: SMTPTransport.Options) => TransporteCorreo;

const transporteNodemailer: CrearTransporte = (opciones) => nodemailer.createTransport(opciones);

/**
 * Pattern: Adapter. Owner: M1. Real mail provider (CORREO_PROVEEDOR=smtp) over any SMTP server; the demo uses
 * Gmail with an app password, which needs no own domain. Every mail goes out from CORREO_REMITENTE. It logs
 * nothing itself and rejects with EnvioCorreoFallidoError, which carries no recipient data.
 */
export class NodemailerCorreoAdapter implements EnviadorCorreo {
  constructor(
    private readonly transporte: TransporteCorreo,
    private readonly remitente: string,
    private readonly plazoMs: number = PLAZO_TOTAL_ENVIO_MS,
  ) {}

  /** Validates the settings (fail-fast at assembly). Creating the transport opens no connection: the first send does. */
  static desdeSmtp(smtp: ConfiguracionSmtp, remitente: string, crearTransporte: CrearTransporte = transporteNodemailer): NodemailerCorreoAdapter {
    const completa = {
      host: exigir(smtp.host, 'SMTP_HOST'),
      puerto: smtp.puerto,
      usuario: exigir(smtp.usuario, 'SMTP_USUARIO'),
      password: exigir(smtp.password, 'SMTP_PASSWORD'),
    };
    return new NodemailerCorreoAdapter(crearTransporte(opcionesTransporteSmtp(completa)), remitente);
  }

  async enviar(mensaje: MensajeCorreo): Promise<void> {
    let temporizador: ReturnType<typeof setTimeout> | undefined;
    const plazoVencido = new Promise<never>((_, rechazar) => {
      temporizador = setTimeout(() => rechazar(new EnvioCorreoFallidoError('ETIMEDOUT')), this.plazoMs);
    });
    try {
      await Promise.race([
        this.transporte.sendMail({
          from: this.remitente,
          to: mensaje.para,
          subject: mensaje.asunto,
          html: mensaje.html,
          text: mensaje.texto,
        }),
        plazoVencido,
      ]);
    } catch (error) {
      throw error instanceof EnvioCorreoFallidoError ? error : sinDatosDelDestinatario(error);
    } finally {
      clearTimeout(temporizador);
    }
  }
}
