/**
 * Pattern: Adapter (port). Opaque single-use tokens (password recovery, M1): only the hash is stored.
 * Implementations: CryptoGeneradorTokenAdapter.
 */
export interface GeneradorToken {
  /** A new unguessable token to send to the user. */
  generar(): string;
  /** Deterministic digest of a token, as stored in token_recuperacion.token_hash. */
  hashear(token: string): string;
}
