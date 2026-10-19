import type { ContextoTx } from '../datasource/ConexionBD.js';
import type { Lugar } from '../entity/Lugar.js';
import type { NivelSaturacion } from '../enum/NivelSaturacion.js';

export interface CambioSaturacion {
  lugarId: number;
  anterior: NivelSaturacion | null;
  nuevo: NivelSaturacion | null;
  actualizadoEn: Date;
}

/**
 * Pattern: Strategy (context). Recomputes and stores a place's level with the configured EstrategiaSaturacion.
 * Owner: M4. Also called by M6 when a report is removed. Runs inside the caller's transaction;
 * it never publishes events (the facade does, after the commit).
 */
export interface SaturacionService {
  /**
   * `lugarActual`: the place as the caller already read it inside `tx` (typically the `FOR UPDATE` row), so its
   * previous level is not read a second time; when omitted the service reads it.
   */
  recalcular(lugarId: number, tx: ContextoTx, lugarActual?: Lugar): Promise<CambioSaturacion>;
}
