import type { Hasher } from '../../../src/adapter/seguridad/Hasher.js';

/** Deterministic Hasher: `hash:<plano>`. Counts comparisons so tests can assert timing-equalising calls. */
export class HasherFalso implements Hasher {
  comparaciones = 0;
  generados = 0;

  async generar(plano: string): Promise<string> {
    this.generados += 1;
    return `hash:${plano}`;
  }

  async comparar(plano: string, hash: string): Promise<boolean> {
    this.comparaciones += 1;
    return hash === `hash:${plano}`;
  }
}
