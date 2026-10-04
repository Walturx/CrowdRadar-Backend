/** Helpers that keep secrets out of logs: masked email for audit lines, redacted token in a logged URL. */
import { describe, expect, it } from 'vitest';
import { enmascararEmail, enmascararEnlace, redactarUrl } from '../../src/util/enmascarar.js';

describe('enmascararEmail', () => {
  it.each([
    ['ana.ruiz@crowdradar.pe', 'a*******@crowdradar.pe'],
    ['ab@crowdradar.pe', 'a*@crowdradar.pe'],
    ['a@crowdradar.pe', 'a@crowdradar.pe'],
  ])('%s -> %s', (entrada, esperado) => {
    expect(enmascararEmail(entrada)).toBe(esperado);
  });

  it('a string without a local part becomes ***', () => {
    expect(enmascararEmail('@crowdradar.pe')).toBe('***');
    expect(enmascararEmail('sin-arroba')).toBe('***');
  });
});

describe('redactarUrl', () => {
  it.each([
    ['/recuperar/restablecer?token=abc123', '/recuperar/restablecer?token=[REDACTADO]'],
    ['/api/auth/restablecer/validar?x=1&token=abc123&y=2', '/api/auth/restablecer/validar?x=1&token=[REDACTADO]&y=2'],
    ['/api/lugares?q=parque', '/api/lugares?q=parque'],
  ])('%s', (entrada, esperado) => {
    expect(redactarUrl(entrada)).toBe(esperado);
  });

  it('undefined stays undefined', () => {
    expect(redactarUrl(undefined)).toBeUndefined();
  });
});

describe('enmascararEnlace', () => {
  it.each([
    ['https://x.test/recuperar/restablecer?token=abcdef123456', 'https://x.test/recuperar/restablecer?token=••••3456'],
    ['ver http://x.test/r?token=ab&otro=1 gracias', 'ver http://x.test/r?token=••••&otro=1 gracias'],
    ['sin enlace con token', 'sin enlace con token'],
  ])('%s', (entrada, esperado) => {
    expect(enmascararEnlace(entrada)).toBe(esperado);
  });

  it('never keeps more than the last 4 characters of the token', () => {
    expect(enmascararEnlace('?token=SECRETO-LARGO-1234')).not.toContain('SECRETO');
  });
});
