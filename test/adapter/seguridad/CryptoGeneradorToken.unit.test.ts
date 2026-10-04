import { describe, expect, it } from 'vitest';
import { CryptoGeneradorToken } from '../../../src/adapter/seguridad/impl/CryptoGeneradorToken.js';

describe('CryptoGeneradorToken', () => {
  const generador = new CryptoGeneradorToken();

  it('generar devuelve 32 bytes en base64url (43 caracteres, sin relleno) y nunca repite', () => {
    const tokens = Array.from({ length: 20 }, () => generador.generar());
    for (const token of tokens) expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(new Set(tokens).size).toBe(20);
  });

  it('hashear es SHA-256 en hexadecimal: vector conocido y determinista', () => {
    expect(generador.hashear('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(generador.hashear('abc')).toBe(generador.hashear('abc'));
    expect(generador.hashear('abd')).not.toBe(generador.hashear('abc'));
    expect(generador.hashear(generador.generar())).toMatch(/^[0-9a-f]{64}$/);
  });
});
