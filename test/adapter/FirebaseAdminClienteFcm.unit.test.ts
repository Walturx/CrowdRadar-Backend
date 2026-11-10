/**
 * FirebaseAdminClienteFcmAdapter is the real ClienteFcm behind PUSH_PROVEEDOR=fcm (spec M3 R8, HU 8.3): it reads the
 * service-account file and loads firebase-admin only on the first send, builds the multicast payload FCM expects and
 * maps one response per token. A fake messaging loader stands in for firebase-admin, so no network or SDK is needed.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import type {
  CredencialesServicioFcm,
  MensajeMulticastFcm,
  RespuestaLoteFcm,
} from '../../src/adapter/push/impl/FirebaseAdminClienteFcmAdapter.js';
import { FirebaseAdminClienteFcmAdapter } from '../../src/adapter/push/impl/FirebaseAdminClienteFcmAdapter.js';

const NOTIFICACION = { titulo: 'Parque Kennedy', cuerpo: 'Ahora esta Saturado', data: { lugarId: '7' } };

// Scratch credentials live in the OS temp dir, never in the repository; the values are fakes.
const DIR = mkdtempSync(join(tmpdir(), 'crowdradar-fcm-'));
afterAll(() => rmSync(DIR, { recursive: true, force: true }));

const CREDENCIALES: CredencialesServicioFcm = {
  project_id: 'proyecto-prueba',
  client_email: 'push@proyecto-prueba.iam.gserviceaccount.com',
  private_key: '-----BEGIN PRIVATE KEY-----\nFALSA\n-----END PRIVATE KEY-----\n',
};

function archivo(nombre: string, contenido: string): string {
  const ruta = join(DIR, nombre);
  writeFileSync(ruta, contenido, 'utf8');
  return ruta;
}

const RUTA_VALIDA = archivo('valida.json', JSON.stringify({ type: 'service_account', ...CREDENCIALES }));

/** Fake firebase-admin: records every multicast and answers each token with `responder(token)`. */
function mensajeriaFalsa(responder: (token: string) => RespuestaLoteFcm['responses'][number] = () => ({ success: true })) {
  const mensajes: MensajeMulticastFcm[] = [];
  const cargas: CredencialesServicioFcm[] = [];
  const cargarMensajeria = async (credenciales: CredencialesServicioFcm) => {
    cargas.push(credenciales);
    return {
      async sendEachForMulticast(mensaje: MensajeMulticastFcm): Promise<RespuestaLoteFcm> {
        mensajes.push(mensaje);
        return { responses: mensaje.tokens.map(responder) };
      },
    };
  };
  return { cargarMensajeria, mensajes, cargas };
}

describe('FirebaseAdminClienteFcmAdapter: carga diferida', () => {
  it('construir no lee el archivo ni carga firebase-admin (aunque la ruta no exista)', () => {
    const { cargarMensajeria, cargas } = mensajeriaFalsa();
    expect(() => new FirebaseAdminClienteFcmAdapter(join(DIR, 'no-existe.json'), { cargarMensajeria })).not.toThrow();
    expect(cargas).toHaveLength(0);
  });

  it('carga firebase-admin una sola vez con las credenciales del archivo y la reutiliza en los envios siguientes', async () => {
    const { cargarMensajeria, cargas, mensajes } = mensajeriaFalsa();
    const cliente = new FirebaseAdminClienteFcmAdapter(RUTA_VALIDA, { cargarMensajeria });
    await cliente.enviar(['a'], NOTIFICACION);
    await cliente.enviar(['b'], NOTIFICACION);
    expect(cargas).toEqual([CREDENCIALES]);
    expect(mensajes).toHaveLength(2);
  });
});

describe('FirebaseAdminClienteFcmAdapter.enviar: mensaje y respuestas', () => {
  it('arma el multicast con notification, data (lugarId) y prioridad alta en Android', async () => {
    const { cargarMensajeria, mensajes } = mensajeriaFalsa();
    await new FirebaseAdminClienteFcmAdapter(RUTA_VALIDA, { cargarMensajeria }).enviar(['t1', 't2'], NOTIFICACION);
    expect(mensajes).toEqual([
      {
        tokens: ['t1', 't2'],
        notification: { title: 'Parque Kennedy', body: 'Ahora esta Saturado' },
        data: { lugarId: '7' },
        android: { priority: 'high' },
      },
    ]);
  });

  it('sin data no envia la clave data', async () => {
    const { cargarMensajeria, mensajes } = mensajeriaFalsa();
    await new FirebaseAdminClienteFcmAdapter(RUTA_VALIDA, { cargarMensajeria }).enviar(['t1'], { titulo: 'T', cuerpo: 'C' });
    expect(mensajes[0]).not.toHaveProperty('data');
  });

  it('devuelve una respuesta por token, en orden, con el codigo de error del proveedor cuando falla', async () => {
    const { cargarMensajeria } = mensajeriaFalsa((token) =>
      token === 'muerto' ? { success: false, error: { code: 'messaging/registration-token-not-registered' } } : { success: true },
    );
    const respuestas = await new FirebaseAdminClienteFcmAdapter(RUTA_VALIDA, { cargarMensajeria }).enviar(['bueno', 'muerto'], NOTIFICACION);
    expect(respuestas).toEqual([{ exito: true }, { exito: false, codigoError: 'messaging/registration-token-not-registered' }]);
  });

  it('un fallo sin codigo de error queda como fallo sin codigo (el token se conserva)', async () => {
    const { cargarMensajeria } = mensajeriaFalsa(() => ({ success: false }));
    expect(await new FirebaseAdminClienteFcmAdapter(RUTA_VALIDA, { cargarMensajeria }).enviar(['t'], NOTIFICACION)).toEqual([{ exito: false }]);
  });

  it('respeta el limite de 500 tokens por multicast: parte en lotes y une las respuestas en el orden de los tokens', async () => {
    const tokens = Array.from({ length: 1001 }, (_, i) => `tok-${i}`);
    const { cargarMensajeria, mensajes } = mensajeriaFalsa((token) =>
      token === 'tok-1000' ? { success: false, error: { code: 'messaging/invalid-registration-token' } } : { success: true },
    );
    const respuestas = await new FirebaseAdminClienteFcmAdapter(RUTA_VALIDA, { cargarMensajeria }).enviar(tokens, NOTIFICACION);
    expect(mensajes.map((m) => m.tokens.length)).toEqual([500, 500, 1]);
    expect(mensajes.flatMap((m) => m.tokens)).toEqual(tokens);
    expect(respuestas).toHaveLength(1001);
    expect(respuestas[1000]).toEqual({ exito: false, codigoError: 'messaging/invalid-registration-token' });
    expect(respuestas.slice(0, 1000).every((r) => r.exito)).toBe(true);
  });

  it('sin tokens no carga firebase-admin ni envia nada', async () => {
    const { cargarMensajeria, cargas, mensajes } = mensajeriaFalsa();
    expect(await new FirebaseAdminClienteFcmAdapter(RUTA_VALIDA, { cargarMensajeria }).enviar([], NOTIFICACION)).toEqual([]);
    expect(cargas).toHaveLength(0);
    expect(mensajes).toHaveLength(0);
  });

  it('si el multicast entero rechaza (proveedor caido) el error se propaga', async () => {
    const cargarMensajeria = async () => ({
      sendEachForMulticast: async (): Promise<RespuestaLoteFcm> => {
        throw new Error('FCM caido');
      },
    });
    await expect(new FirebaseAdminClienteFcmAdapter(RUTA_VALIDA, { cargarMensajeria }).enviar(['t'], NOTIFICACION)).rejects.toThrow('FCM caido');
  });
});

describe('FirebaseAdminClienteFcmAdapter: credenciales ilegibles', () => {
  const SECRETO = 'SECRETO-NO-DEBE-FILTRARSE';

  it.each([
    ['la ruta no existe', join(DIR, 'no-existe.json')],
    ['el archivo no es JSON', archivo('roto.json', `{ "private_key": "${SECRETO}" `)],
    ['el JSON no es un objeto', archivo('lista.json', JSON.stringify([SECRETO]))],
    ['faltan campos de la cuenta de servicio', archivo('incompleta.json', JSON.stringify({ project_id: SECRETO }))],
  ])('si %s falla con un mensaje claro en castellano, sin el contenido del archivo y sin cargar firebase-admin', async (_caso, ruta) => {
    const { cargarMensajeria, cargas } = mensajeriaFalsa();
    const error = await new FirebaseAdminClienteFcmAdapter(ruta, { cargarMensajeria }).enviar(['t'], NOTIFICACION).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toMatch(/credenciales de FCM/);
    expect((error as Error).message).toContain('FCM_CREDENCIALES_RUTA');
    expect((error as Error).message).not.toContain(SECRETO);
    expect(JSON.stringify(error)).not.toContain(SECRETO);
    expect(cargas).toHaveLength(0);
  });

  it('tras un fallo de lectura reintenta en el siguiente envio (el archivo puede aparecer despues)', async () => {
    const ruta = join(DIR, 'tardio.json');
    const { cargarMensajeria, cargas } = mensajeriaFalsa();
    const cliente = new FirebaseAdminClienteFcmAdapter(ruta, { cargarMensajeria });
    await expect(cliente.enviar(['t'], NOTIFICACION)).rejects.toThrow(/credenciales de FCM/);
    writeFileSync(ruta, JSON.stringify(CREDENCIALES), 'utf8');
    expect(await cliente.enviar(['t'], NOTIFICACION)).toEqual([{ exito: true }]);
    expect(cargas).toHaveLength(1);
  });
});
