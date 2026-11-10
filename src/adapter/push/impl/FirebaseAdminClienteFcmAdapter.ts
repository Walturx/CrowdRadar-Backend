import { readFile } from 'node:fs/promises';
import type { NotificacionPush } from '../NotificadorPush.js';
import type { ClienteFcm, RespuestaFcm } from './FcmNotificadorAdapter.js';

/** Fields of the Google service-account JSON that firebase-admin needs to sign its requests. */
export interface CredencialesServicioFcm {
  project_id: string;
  client_email: string;
  private_key: string;
}

/** Multicast payload, the subset of firebase-admin's `MulticastMessage` this app sends. */
export interface MensajeMulticastFcm {
  tokens: string[];
  notification: { title: string; body: string };
  data?: Record<string, string>;
  android: { priority: 'high' };
}

/** Subset of firebase-admin's `BatchResponse`: one entry per token, in the order of `tokens`. */
export interface RespuestaLoteFcm {
  responses: { success: boolean; error?: { code: string } }[];
}

/** Narrow view of firebase-admin's `Messaging`. */
export interface MensajeriaFcm {
  sendEachForMulticast(mensaje: MensajeMulticastFcm): Promise<RespuestaLoteFcm>;
}

/** Builds the messaging of an app signed with `credenciales`; the default one imports firebase-admin. */
export type CargadorMensajeriaFcm = (credenciales: CredencialesServicioFcm) => Promise<MensajeriaFcm>;

export interface OpcionesFirebaseAdminClienteFcm {
  /** Replaces the firebase-admin loader (unit tests hand a fake messaging). */
  cargarMensajeria?: CargadorMensajeriaFcm;
}

/** FCM rejects a multicast with more than 500 tokens. */
export const LIMITE_MULTICAST_FCM = 500;

/** Own app name, so the push client never collides with another default firebase-admin app in the process. */
const NOMBRE_APP = 'crowdradar-push';

/** Default loader: imports firebase-admin on demand, so console mode and the tests never load it. */
const cargarFirebaseAdmin: CargadorMensajeriaFcm = async (credenciales) => {
  const [{ cert, getApps, initializeApp }, { getMessaging }] = await Promise.all([
    import('firebase-admin/app'),
    import('firebase-admin/messaging'),
  ]);
  const app =
    getApps().find((existente) => existente.name === NOMBRE_APP) ??
    initializeApp(
      {
        credential: cert({
          projectId: credenciales.project_id,
          clientEmail: credenciales.client_email,
          privateKey: credenciales.private_key,
        }),
      },
      NOMBRE_APP,
    );
  return getMessaging(app);
};

/**
 * Pattern: Adapter. Owner: M3. Real ClienteFcm over firebase-admin (`messaging().sendEachForMulticast`). Nothing
 * happens at construction: the first send reads the service-account file at FCM_CREDENCIALES_RUTA and only then
 * loads firebase-admin, so a missing or invalid file fails with a Spanish message that never echoes the file's
 * content (it holds a private key). A failed load is retried on the next send.
 */
export class FirebaseAdminClienteFcmAdapter implements ClienteFcm {
  private readonly cargarMensajeria: CargadorMensajeriaFcm;
  private mensajeria?: Promise<MensajeriaFcm>;

  constructor(
    private readonly credencialesRuta: string,
    { cargarMensajeria = cargarFirebaseAdmin }: OpcionesFirebaseAdminClienteFcm = {},
  ) {
    this.cargarMensajeria = cargarMensajeria;
  }

  async enviar(tokens: readonly string[], notificacion: NotificacionPush): Promise<RespuestaFcm[]> {
    if (tokens.length === 0) return [];
    const mensajeria = await this.obtenerMensajeria();
    const respuestas: RespuestaFcm[] = [];
    for (let inicio = 0; inicio < tokens.length; inicio += LIMITE_MULTICAST_FCM) {
      const lote = await mensajeria.sendEachForMulticast(this.mensaje(tokens.slice(inicio, inicio + LIMITE_MULTICAST_FCM), notificacion));
      respuestas.push(...lote.responses.map(aRespuestaFcm));
    }
    return respuestas;
  }

  private mensaje(tokens: string[], { titulo, cuerpo, data }: NotificacionPush): MensajeMulticastFcm {
    return {
      tokens,
      notification: { title: titulo, body: cuerpo },
      ...(data ? { data: { ...data } } : {}),
      android: { priority: 'high' },
    };
  }

  private obtenerMensajeria(): Promise<MensajeriaFcm> {
    this.mensajeria ??= this.leerCredenciales()
      .then((credenciales) => this.cargarMensajeria(credenciales))
      .catch((error: unknown) => {
        this.mensajeria = undefined;
        throw error;
      });
    return this.mensajeria;
  }

  private async leerCredenciales(): Promise<CredencialesServicioFcm> {
    const fallo = (motivo: string) =>
      new Error(`No se pudieron cargar las credenciales de FCM (FCM_CREDENCIALES_RUTA=${this.credencialesRuta}): ${motivo}.`);
    let texto: string;
    try {
      texto = await readFile(this.credencialesRuta, 'utf8');
    } catch (error) {
      const codigo = (error as NodeJS.ErrnoException).code;
      throw fallo(codigo ? `no se pudo leer el archivo (${codigo})` : 'no se pudo leer el archivo');
    }
    let json: unknown;
    try {
      json = JSON.parse(texto);
    } catch {
      // The parser's message quotes the content, which may include the private key: never forward it.
      throw fallo('el archivo no es JSON valido');
    }
    if (!esCredencial(json)) {
      throw fallo('el archivo no es una cuenta de servicio (faltan project_id, client_email o private_key)');
    }
    return { project_id: json.project_id, client_email: json.client_email, private_key: json.private_key };
  }
}

function esCredencial(valor: unknown): valor is CredencialesServicioFcm {
  if (typeof valor !== 'object' || valor === null || Array.isArray(valor)) return false;
  const campos = valor as Record<string, unknown>;
  return ['project_id', 'client_email', 'private_key'].every((campo) => typeof campos[campo] === 'string' && campos[campo] !== '');
}

function aRespuestaFcm({ success, error }: RespuestaLoteFcm['responses'][number]): RespuestaFcm {
  if (success) return { exito: true };
  return error?.code ? { exito: false, codigoError: error.code } : { exito: false };
}
