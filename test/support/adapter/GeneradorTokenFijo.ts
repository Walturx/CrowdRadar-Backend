import type { GeneradorToken } from '../../../src/adapter/seguridad/GeneradorToken.js';

/** Hands out the given tokens in order; the hash is readable: hash(<token>) padded with zeros to 64 chars. */
export class GeneradorTokenFijo implements GeneradorToken {
  private indice = 0;

  constructor(private readonly tokens: readonly string[]) {}

  generar(): string {
    const token = this.tokens[this.indice];
    if (token === undefined) throw new Error('GeneradorTokenFijo: sin tokens');
    this.indice += 1;
    return token;
  }

  hashear(token: string): string {
    return `hash(${token})`.padEnd(64, '0');
  }
}
