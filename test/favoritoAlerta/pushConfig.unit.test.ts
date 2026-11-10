/**
 * Provider selection (spec M3 R8): PUSH_PROVEEDOR unset or consola boots with the console adapter and never loads
 * firebase-admin; fcm with a credentials path selects FcmNotificadorAdapter backed by the real firebase-admin client;
 * fcm without one fails fast (the environment schema already rejects it at startup, see ConfiguracionApp.unit.test).
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ConsolaNotificadorAdapter } from '../../src/adapter/push/impl/ConsolaNotificadorAdapter.js';
import { FcmNotificadorAdapter } from '../../src/adapter/push/impl/FcmNotificadorAdapter.js';
import { ConfiguracionApp } from '../../src/config/ConfiguracionApp.js';
import { crearNotificadorPush } from '../../src/container/favoritoAlerta.js';
import { configPrueba, type SobrescritosEntorno } from '../support/configPrueba.js';
import { crearLoggerSilencioso } from '../support/LoggerSilencioso.js';
import { NoImplementadoException } from '../../src/exception/http/NoImplementadoException.js';

const RAIZ = resolve(import.meta.dirname, '..', '..');

/** Every TypeScript source under src/, as repo-relative POSIX paths. */
function fuentes(dir = join(RAIZ, 'src')): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entrada) => {
    const ruta = join(dir, entrada.name);
    if (entrada.isDirectory()) return fuentes(ruta);
    return entrada.name.endsWith('.ts') ? [relative(RAIZ, ruta).split(sep).join('/')] : [];
  });
}

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

  it('PUSH_PROVEEDOR=fcm envia por el cliente firebase-admin real: ya no es un esqueleto que lanza NoImplementadoException', async () => {
    // The real client reads the credentials first, so a missing file fails offline before loading firebase-admin.
    const push = pushDe({ PUSH_PROVEEDOR: 'fcm', FCM_CREDENCIALES_RUTA: './no-existe-cred.json' });
    const error = await crearNotificadorPush(push, logger).enviar(['t1'], { titulo: 'T', cuerpo: 'C' }).catch((e: unknown) => e);
    expect(error).not.toBeInstanceOf(NoImplementadoException);
    expect((error as Error).message).toMatch(/credenciales de FCM/);
  });

  it('el modo consola sigue enviando y nunca carga firebase-admin: ningun modulo lo importa estaticamente', async () => {
    expect(await crearNotificadorPush(configPrueba().push, logger).enviar(['t1', 't2'], { titulo: 'T', cuerpo: 'C' })).toEqual({
      enviados: 2,
      tokensInvalidos: [],
    });
    const conImportEstatico = fuentes().filter((ruta) => /^\s*import\s[^;]*from\s+['"]firebase-admin/m.test(readFileSync(join(RAIZ, ruta), 'utf8')));
    expect(conImportEstatico).toEqual([]);
    const conImportDinamico = fuentes().filter((ruta) => /import\(\s*['"]firebase-admin/.test(readFileSync(join(RAIZ, ruta), 'utf8')));
    expect(conImportDinamico).toEqual(['src/adapter/push/impl/FirebaseAdminClienteFcmAdapter.ts']);
  });

  it('PUSH_PROVEEDOR=fcm sin ruta de credenciales falla al construir (defensa ademas del esquema de entorno)', () => {
    const push = { proveedor: 'fcm', fcmCredencialesRuta: undefined } as ConfiguracionApp['push'];
    expect(() => crearNotificadorPush(push, logger)).toThrow(/FCM_CREDENCIALES_RUTA/);
  });
});
