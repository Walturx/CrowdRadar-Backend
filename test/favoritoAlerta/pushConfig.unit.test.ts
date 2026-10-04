/**
 * Provider selection (spec M3 R8): PUSH_PROVEEDOR unset or consola boots with the console adapter and no
 * Firebase; fcm with a credentials path selects FcmNotificadorAdapter; fcm without one fails fast (the environment
 * schema already rejects it at startup, see ConfiguracionApp.unit.test).
 */
import { describe, expect, it } from 'vitest';
import { ConsolaNotificadorAdapter } from '../../src/adapter/push/impl/ConsolaNotificadorAdapter.js';
import { FcmNotificadorAdapter } from '../../src/adapter/push/impl/FcmNotificadorAdapter.js';
import { ConfiguracionApp } from '../../src/config/ConfiguracionApp.js';
import { crearNotificadorPush } from '../../src/container/favoritoAlerta.js';
import { configPrueba, type SobrescritosEntorno } from '../support/configPrueba.js';
import { crearLoggerSilencioso } from '../support/LoggerSilencioso.js';

const logger = crearLoggerSilencioso();
const pushDe = (entorno: SobrescritosEntorno) => configPrueba(entorno).push;

describe('crearNotificadorPush', () => {
  it('sin PUSH_PROVEEDOR usa el adaptador de consola (no necesita Firebase)', () => {
    expect(crearNotificadorPush(configPrueba().push, logger)).toBeInstanceOf(ConsolaNotificadorAdapter);
  });

  it('PUSH_PROVEEDOR=consola usa el adaptador de consola aunque haya una ruta de credenciales', () => {
    const push = pushDe({ PUSH_PROVEEDOR: 'consola', FCM_CREDENCIALES_RUTA: './cred.json' });
    expect(crearNotificadorPush(push, logger)).toBeInstanceOf(ConsolaNotificadorAdapter);
  });

  it('PUSH_PROVEEDOR=fcm con ruta de credenciales selecciona FcmNotificadorAdapter', () => {
    const push = pushDe({ PUSH_PROVEEDOR: 'fcm', FCM_CREDENCIALES_RUTA: './cred.json' });
    expect(crearNotificadorPush(push, logger)).toBeInstanceOf(FcmNotificadorAdapter);
  });

  it('PUSH_PROVEEDOR=fcm sin ruta de credenciales falla al construir (defensa ademas del esquema de entorno)', () => {
    const push = { proveedor: 'fcm', fcmCredencialesRuta: undefined } as ConfiguracionApp['push'];
    expect(() => crearNotificadorPush(push, logger)).toThrow(/FCM_CREDENCIALES_RUTA/);
  });
});
