/** conectar() must surface the ORIGINAL verification error even when closing the half-open connection fails (R3-208, R4-210). */
import { describe, expect, it } from 'vitest';
import type { ConexionBD } from '../../src/datasource/ConexionBD.js';
import { ConexionFactory } from '../../src/datasource/ConexionFactory.js';

class ConexionRota implements ConexionBD {
  cerrada = false;
  async transaccion<T>(): Promise<T> {
    throw new Error('no se usa');
  }
  async verificar(): Promise<void> {
    throw new Error('ECONNREFUSED original');
  }
  async cerrar(): Promise<void> {
    this.cerrada = true;
    throw new Error('fallo secundario al cerrar');
  }
}

class FabricaRota extends ConexionFactory {
  readonly conexion = new ConexionRota();
  protected crearConexion(): ConexionBD {
    return this.conexion;
  }
}

describe('ConexionFactory.conectar con cierre fallido', () => {
  it('rechaza con el error de verificacion, no con el del cierre, y intenta cerrar', async () => {
    const fabrica = new FabricaRota();
    await expect(fabrica.conectar()).rejects.toThrow('ECONNREFUSED original');
    expect(fabrica.conexion.cerrada).toBe(true);
  });
});
