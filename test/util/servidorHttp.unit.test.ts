/** Server lifecycle: timeouts (R4-204), graceful shutdown (R4-202) and process hooks. */
import { EventEmitter } from 'node:events';
import { createServer } from 'node:http';
import { describe, expect, it, vi } from 'vitest';
import { configurarTimeouts, crearApagado, instalarHooksProceso } from '../../src/util/servidorHttp.js';
import { ConexionFalsa } from '../support/ConexionFalsa.js';
import { crearLoggerEspia } from '../support/LoggerEspia.js';

describe('configurarTimeouts', () => {
  it('aplica requestTimeout, headersTimeout y keepAliveTimeout al http.Server', () => {
    const servidor = createServer();
    configurarTimeouts(servidor, { requestMs: 20000, headersMs: 10000, keepAliveMs: 7000 });
    expect(servidor.requestTimeout).toBe(20000);
    expect(servidor.headersTimeout).toBe(10000);
    expect(servidor.keepAliveTimeout).toBe(7000);
  });
});

function entornoApagado(opciones: { cierreServidor?: (cb: (e?: Error) => void) => void; timeoutMs?: number; errorConexion?: boolean } = {}) {
  const eventos: string[] = [];
  const espia = crearLoggerEspia('info');
  const servidor = {
    close: (cb: (e?: Error) => void) => {
      eventos.push('servidor.close');
      (opciones.cierreServidor ?? ((fin) => fin()))(cb);
    },
  };
  const conexion = new ConexionFalsa();
  const cerrar = conexion.cerrar.bind(conexion);
  conexion.cerrar = async () => {
    eventos.push('conexion.cerrar');
    if (opciones.errorConexion) throw new Error('fallo al cerrar');
    await cerrar();
  };
  const salir = vi.fn((codigo: number) => void eventos.push(`salir:${codigo}`));
  const apagar = crearApagado({ servidor, conexion, logger: espia.logger, timeoutMs: opciones.timeoutMs ?? 1000, salir });
  return { apagar, eventos, conexion, salir, espia };
}

describe('crearApagado', () => {
  it('cierra primero el servidor, luego la conexion, y sale con 0', async () => {
    const { apagar, eventos, conexion } = entornoApagado();
    await apagar('SIGTERM');
    expect(eventos).toEqual(['servidor.close', 'conexion.cerrar', 'salir:0']);
    expect(conexion.cerrada).toBe(true);
  });

  it('es idempotente: una segunda senal durante el cierre no repite nada', async () => {
    const { apagar, eventos } = entornoApagado();
    await Promise.all([apagar('SIGTERM'), apagar('SIGINT')]);
    expect(eventos.filter((e) => e === 'servidor.close')).toHaveLength(1);
    expect(eventos.filter((e) => e.startsWith('salir'))).toHaveLength(1);
  });

  it('si el servidor falla al cerrar igual cierra la conexion y sale con 1', async () => {
    const { apagar, eventos, espia } = entornoApagado({ cierreServidor: (cb) => cb(new Error('no cierra')) });
    await apagar('SIGTERM');
    expect(eventos).toEqual(['servidor.close', 'conexion.cerrar', 'salir:1']);
    expect(espia.lineas.some((l) => l.level === 50)).toBe(true);
  });

  it('si la conexion falla al cerrar sale con 1', async () => {
    const { apagar, eventos } = entornoApagado({ errorConexion: true });
    await apagar('SIGTERM');
    expect(eventos).toEqual(['servidor.close', 'conexion.cerrar', 'salir:1']);
  });

  it('un codigo de salida explicito se respeta cuando todo cierra bien', async () => {
    const { apagar, salir } = entornoApagado();
    await apagar('unhandledRejection', 1);
    expect(salir).toHaveBeenCalledWith(1);
  });

  it('fuerza la salida con 1 si el cierre no termina dentro del timeout', async () => {
    const { apagar, salir, espia } = entornoApagado({ cierreServidor: () => undefined, timeoutMs: 30 });
    await apagar('SIGTERM');
    expect(salir).toHaveBeenCalledWith(1);
    expect(espia.lineas.some((l) => String(l.msg).includes('tiempo'))).toBe(true);
  });
});

describe('instalarHooksProceso', () => {
  function proceso() {
    return Object.assign(new EventEmitter(), { exit: vi.fn() });
  }

  it.each(['SIGTERM', 'SIGINT'])('%s inicia el apagado ordenado con codigo 0', (senal) => {
    const p = proceso();
    const apagar = vi.fn(async () => undefined);
    instalarHooksProceso({ proceso: p, logger: crearLoggerEspia().logger, apagar });
    p.emit(senal);
    expect(apagar).toHaveBeenCalledWith(senal, 0);
  });

  it('unhandledRejection se registra y apaga con codigo 1', () => {
    const p = proceso();
    const apagar = vi.fn(async () => undefined);
    const espia = crearLoggerEspia();
    instalarHooksProceso({ proceso: p, logger: espia.logger, apagar });
    p.emit('unhandledRejection', new Error('promesa rota'));
    expect(apagar).toHaveBeenCalledWith('unhandledRejection', 1);
    expect(espia.lineas.some((l) => l.level === 50 && JSON.stringify(l).includes('promesa rota'))).toBe(true);
  });

  it('uncaughtException se registra como fatal y sale de inmediato con 1', () => {
    const p = proceso();
    const apagar = vi.fn(async () => undefined);
    const espia = crearLoggerEspia();
    instalarHooksProceso({ proceso: p, logger: espia.logger, apagar });
    p.emit('uncaughtException', new Error('estado corrupto'));
    expect(espia.lineas.some((l) => l.level === 60 && JSON.stringify(l).includes('estado corrupto'))).toBe(true);
    expect(p.exit).toHaveBeenCalledWith(1);
    expect(apagar).not.toHaveBeenCalled();
  });
});
