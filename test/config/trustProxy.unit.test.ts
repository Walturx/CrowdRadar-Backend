/** TRUST_PROXY: how many proxy hops Express trusts for the client IP (rate-limit key). Default false. */
import { describe, expect, it } from 'vitest';
import { configPrueba } from '../support/configPrueba.js';

describe('TRUST_PROXY', () => {
  it('por defecto no se confia en ningun proxy', () => {
    expect(configPrueba().servidor.trustProxy).toBe(false);
  });

  it.each([
    ['true', true],
    ['false', false],
    ['1', 1],
    ['2', 2],
    ['loopback', 'loopback'],
  ])('%s -> %j', (texto, esperado) => {
    expect(configPrueba({ TRUST_PROXY: texto }).servidor.trustProxy).toBe(esperado);
  });

  it('CORS_ORIGENES se expone como lista recortada', () => {
    expect(configPrueba({ CORS_ORIGENES: ' http://a.pe , http://b.pe ' }).servidor.corsOrigenes).toEqual([
      'http://a.pe',
      'http://b.pe',
    ]);
  });
});
