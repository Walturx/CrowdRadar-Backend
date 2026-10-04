/** Unit tests of the bcrypt Adapter behind the Hasher port (design 4.1; spec R-B1 bcrypt cost from config). */
import { describe, expect, it } from 'vitest';
import { BcryptHasherAdapter } from '../../../src/adapter/seguridad/impl/BcryptHasherAdapter.js';

describe('BcryptHasherAdapter', () => {
  const hasher = new BcryptHasherAdapter(4);

  it('genera un hash bcrypt con el costo configurado, distinto en cada llamada (salt)', async () => {
    const a = await hasher.generar('Secreta123');
    const b = await hasher.generar('Secreta123');
    expect(a).toMatch(/^\$2[aby]\$04\$/);
    expect(a).not.toBe(b);
    expect(a).not.toContain('Secreta123');
  });

  it('compara true con la contrasena correcta y false con otra', async () => {
    const hash = await hasher.generar('Secreta123');
    expect(await hasher.comparar('Secreta123', hash)).toBe(true);
    expect(await hasher.comparar('secreta123', hash)).toBe(false);
  });

  it('compara false (sin lanzar) cuando el hash almacenado no es valido', async () => {
    expect(await hasher.comparar('Secreta123', 'no-es-un-hash')).toBe(false);
  });
});
