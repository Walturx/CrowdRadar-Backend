/**
 * FcmNotificadorAdapter is a skeleton behind PUSH_PROVEEDOR=fcm (spec M3 R8): it validates its configuration,
 * never ships functional without a Firebase client, and maps the provider's invalid-token errors.
 */
import { describe, expect, it } from 'vitest';
import type { ClienteFcm, RespuestaFcm } from '../../src/adapter/push/impl/FcmNotificadorAdapter.js';
import { FcmNotificadorAdapter } from '../../src/adapter/push/impl/FcmNotificadorAdapter.js';
import { NoImplementadoException } from '../../src/exception/http/NoImplementadoException.js';

const NOTIFICACION = { titulo: 'Parque Kennedy', cuerpo: 'Ahora esta Saturado', data: { lugarId: '7' } };

const clienteQueResponde = (respuestas: RespuestaFcm[]) => {
  const llamadas: { tokens: readonly string[] }[] = [];
  const cliente: ClienteFcm = {
    async enviar(tokens) {
      llamadas.push({ tokens });
      return respuestas;
    },
  };
  return { cliente, llamadas };
};

describe('FcmNotificadorAdapter: configuracion', () => {
  it('con proveedor fcm exige la ruta de credenciales (fail-fast al construir)', () => {
    expect(() => new FcmNotificadorAdapter({ proveedor: 'fcm' })).toThrow(/FCM_CREDENCIALES_RUTA/);
    expect(() => new FcmNotificadorAdapter({ proveedor: 'fcm', credencialesRuta: '   ' })).toThrow(/FCM_CREDENCIALES_RUTA/);
  });

  it('con proveedor fcm y credenciales construye sin leer el archivo ni cargar Firebase', () => {
    expect(() => new FcmNotificadorAdapter({ proveedor: 'fcm', credencialesRuta: './no-existe.json' })).not.toThrow();
  });
});

describe('FcmNotificadorAdapter.enviar: nunca funcional sin Firebase', () => {
  it('con proveedor consola (no habilitado) lanza NoImplementadoException aunque haya credenciales y cliente', async () => {
    const { cliente, llamadas } = clienteQueResponde([{ exito: true }]);
    const adaptador = new FcmNotificadorAdapter({ proveedor: 'consola', credencialesRuta: './cred.json', cliente });
    await expect(adaptador.enviar(['t1'], NOTIFICACION)).rejects.toBeInstanceOf(NoImplementadoException);
    expect(llamadas).toHaveLength(0);
  });

  it('con fcm y credenciales pero sin cliente Firebase lanza NoImplementadoException explicando que falta la integracion', async () => {
    const adaptador = new FcmNotificadorAdapter({ proveedor: 'fcm', credencialesRuta: './cred.json' });
    const error = await adaptador.enviar(['t1'], NOTIFICACION).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(NoImplementadoException);
    expect((error as Error).message).toContain('firebase-admin');
  });
});

describe('FcmNotificadorAdapter.enviar: con cliente (fcm habilitado)', () => {
  const crear = (respuestas: RespuestaFcm[]) => {
    const { cliente, llamadas } = clienteQueResponde(respuestas);
    return { llamadas, adaptador: new FcmNotificadorAdapter({ proveedor: 'fcm', credencialesRuta: './cred.json', cliente }) };
  };

  it('cuenta los envios exitosos y no marca invalidos si todo salio bien', async () => {
    const { adaptador, llamadas } = crear([{ exito: true }, { exito: true }]);
    expect(await adaptador.enviar(['a', 'b'], NOTIFICACION)).toEqual({ enviados: 2, tokensInvalidos: [] });
    expect(llamadas[0]?.tokens).toEqual(['a', 'b']);
  });

  it.each(['messaging/registration-token-not-registered', 'messaging/invalid-registration-token'])(
    'el error %s marca el token como invalido y no cuenta como enviado',
    async (codigoError) => {
      const { adaptador } = crear([{ exito: true }, { exito: false, codigoError }]);
      expect(await adaptador.enviar(['bueno', 'muerto'], NOTIFICACION)).toEqual({ enviados: 1, tokensInvalidos: ['muerto'] });
    },
  );

  it('otro error de un token (cuota, servidor) ni se cuenta ni se marca invalido: el token se conserva', async () => {
    const { adaptador } = crear([{ exito: false, codigoError: 'messaging/server-unavailable' }]);
    expect(await adaptador.enviar(['t'], NOTIFICACION)).toEqual({ enviados: 0, tokensInvalidos: [] });
  });

  it('sin tokens no llama al cliente', async () => {
    const { adaptador, llamadas } = crear([]);
    expect(await adaptador.enviar([], NOTIFICACION)).toEqual({ enviados: 0, tokensInvalidos: [] });
    expect(llamadas).toHaveLength(0);
  });

  it('si el cliente rechaza (proveedor caido) el error se propaga para que el publicador lo aisle', async () => {
    const cliente: ClienteFcm = {
      async enviar() {
        throw new Error('FCM caido');
      },
    };
    const adaptador = new FcmNotificadorAdapter({ proveedor: 'fcm', credencialesRuta: './cred.json', cliente });
    await expect(adaptador.enviar(['t'], NOTIFICACION)).rejects.toThrow('FCM caido');
  });
});
