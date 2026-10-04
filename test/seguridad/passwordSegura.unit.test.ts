/** Shared password policy (spec M1 R5; HU 2.2 c3, 2.3 c4): 8..64 characters, at most 72 bytes, an uppercase letter and a digit. */
import { describe, expect, it } from 'vitest';
import { passwordSeguraSchema } from '../../src/dto/request/passwordSegura.js';

const mensajes = (valor: unknown): string[] => {
  const resultado = passwordSeguraSchema.safeParse(valor);
  return resultado.success ? [] : resultado.error.issues.map((i) => i.message);
};

describe('passwordSeguraSchema', () => {
  it.each([
    ['8 characters', 'Abcdefg1'],
    ['64 characters', `A1${'a'.repeat(62)}`],
    ['multibyte inside both caps', `A1${'ñ'.repeat(30)}`],
  ])('accepts %s', (_nombre, password) => {
    expect(mensajes(password)).toEqual([]);
  });

  it('counts code points, not UTF-16 units (R3-1301): 64 code points with emoji are accepted, 65 are rejected', () => {
    const dosEmoji = '😀😀';
    const en64 = `A1${'a'.repeat(60)}${dosEmoji}`; // 64 code points, 66 UTF-16 units, 68 bytes
    expect([...en64]).toHaveLength(64);
    expect(en64.length).toBeGreaterThan(64);
    expect(mensajes(en64)).toEqual([]);
    expect(mensajes(`A1${'a'.repeat(61)}${dosEmoji}`)).toHaveLength(1); // 65 code points
  });

  it('counts a short emoji password by code points (8 code points, 10 UTF-16 units)', () => {
    expect(mensajes('A1aaaa😀😀')).toEqual([]);
    expect(mensajes('A1aaa😀😀')).toHaveLength(1); // 7 code points
  });

  it('rejects 7 characters with exactly one error (the length rule)', () => {
    expect(mensajes('Abcdef1')).toHaveLength(1);
  });

  it('rejects 65 characters with exactly one error', () => {
    expect(mensajes(`A1${'a'.repeat(63)}`)).toHaveLength(1);
  });

  it('rejects a string of at most 64 characters but more than 72 bytes (multibyte)', () => {
    const password = `A1${'ñ'.repeat(40)}`; // 42 characters, 82 bytes
    expect(password.length).toBeLessThanOrEqual(64);
    expect(Buffer.byteLength(password)).toBeGreaterThan(72);
    expect(mensajes(password)).toHaveLength(1);
  });

  it('rejects a missing uppercase letter with exactly one error', () => {
    expect(mensajes('abcdefg1')).toHaveLength(1);
  });

  it('rejects a missing digit with exactly one error', () => {
    expect(mensajes('Abcdefgh')).toHaveLength(1);
  });

  it('reports one error per unmet rule', () => {
    expect(mensajes('abc')).toHaveLength(3); // length, uppercase, digit
    expect(new Set(mensajes('abc')).size).toBe(3);
  });

  it('rejects non-strings', () => {
    expect(mensajes(12345678)).toHaveLength(1);
  });
});
