/** Retry with exponential backoff, used for the database connection at boot (R4-201). */
import { describe, expect, it, vi } from 'vitest';
import { reintentar } from '../../src/util/reintentar.js';

describe('reintentar', () => {
  const sinEspera = () => {
    const esperas: number[] = [];
    return { esperas, dormir: async (ms: number) => void esperas.push(ms) };
  };

  it('devuelve el resultado al primer intento sin esperar', async () => {
    const { esperas, dormir } = sinEspera();
    expect(await reintentar(async () => 'ok', { intentos: 5, esperaInicialMs: 100, dormir })).toBe('ok');
    expect(esperas).toEqual([]);
  });

  it('reintenta con espera exponencial y devuelve el primer exito', async () => {
    const { esperas, dormir } = sinEspera();
    const operacion = vi.fn().mockRejectedValueOnce(new Error('a')).mockRejectedValueOnce(new Error('b')).mockResolvedValue('listo');
    expect(await reintentar(operacion, { intentos: 5, esperaInicialMs: 50, dormir })).toBe('listo');
    expect(operacion).toHaveBeenCalledTimes(3);
    expect(esperas).toEqual([50, 100]);
  });

  it('agota los intentos, espera n-1 veces con backoff y lanza el ULTIMO error', async () => {
    const { esperas, dormir } = sinEspera();
    let n = 0;
    const operacion = async () => {
      n += 1;
      throw new Error(`fallo ${n}`);
    };
    await expect(reintentar(operacion, { intentos: 5, esperaInicialMs: 50, dormir })).rejects.toThrow('fallo 5');
    expect(n).toBe(5);
    expect(esperas).toEqual([50, 100, 200, 400]);
  });

  it('respeta el tope de espera', async () => {
    const { esperas, dormir } = sinEspera();
    await reintentar(async () => Promise.reject(new Error('x')), { intentos: 5, esperaInicialMs: 100, esperaMaxMs: 250, dormir }).catch(
      () => undefined,
    );
    expect(esperas).toEqual([100, 200, 250, 250]);
  });

  it('con un solo intento no espera', async () => {
    const { esperas, dormir } = sinEspera();
    await expect(reintentar(async () => Promise.reject(new Error('x')), { intentos: 1, esperaInicialMs: 100, dormir })).rejects.toThrow('x');
    expect(esperas).toEqual([]);
  });

  it('avisa cada fallo con el numero de intento y la espera siguiente (null en el ultimo)', async () => {
    const { dormir } = sinEspera();
    const avisos: Array<[number, number | null]> = [];
    await reintentar(async () => Promise.reject(new Error('x')), {
      intentos: 3,
      esperaInicialMs: 10,
      dormir,
      alFallar: (_error, intento, espera) => avisos.push([intento, espera]),
    }).catch(() => undefined);
    expect(avisos).toEqual([
      [1, 10],
      [2, 20],
      [3, null],
    ]);
  });
});
