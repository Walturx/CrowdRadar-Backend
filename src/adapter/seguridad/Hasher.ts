/** Pattern: Adapter (port). One-way password hashing; BcryptHasherAdapter adapts bcrypt. */
export interface Hasher {
  generar(plano: string): Promise<string>;
  /** False (never throws) when the password does not match or the stored hash is malformed. */
  comparar(plano: string, hash: string): Promise<boolean>;
}
