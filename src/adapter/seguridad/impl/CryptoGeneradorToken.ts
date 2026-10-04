import { createHash, randomBytes } from 'node:crypto';
import type { GeneradorToken } from '../GeneradorToken.js';

/** 32 random bytes as base64url (43 chars); stored as SHA-256 hex (64 chars). */
export class CryptoGeneradorToken implements GeneradorToken {
  generar(): string {
    return randomBytes(32).toString('base64url');
  }

  hashear(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
