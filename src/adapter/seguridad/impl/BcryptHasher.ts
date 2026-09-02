import bcrypt from 'bcrypt';
import type { Hasher } from '../Hasher.js';

/** Pattern: Adapter. bcrypt behind the Hasher port; the cost comes from configuration (BCRYPT_COSTO). */
export class BcryptHasher implements Hasher {
  constructor(private readonly costo: number) {}

  generar(plano: string): Promise<string> {
    return bcrypt.hash(plano, this.costo);
  }

  async comparar(plano: string, hash: string): Promise<boolean> {
    try {
      return await bcrypt.compare(plano, hash);
    } catch {
      return false;
    }
  }
}
