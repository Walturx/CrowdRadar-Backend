import type { ContextoTx } from '../datasource/ConexionBD.js';
import type { SancionUsuario } from '../entity/SancionUsuario.js';

export interface NuevaSancion {
  usuarioId: number;
  administradorId: number;
  /** One of DIAS_SUSPENSION. */
  dias: number;
  motivo: string;
  fechaInicio: Date;
  /** Must be after `fechaInicio` (ck_sancion_fechas). */
  fechaFin: Date;
}

/** Pattern: DAO (port). Persistence contract for `sancion_usuario`. Owner: M6. */
export interface SancionDAO {
  crear(datos: NuevaSancion, tx?: ContextoTx): Promise<SancionUsuario>;
  /** Latest sanction not lifted whose `fechaFin` is after `ahora`; null when the user is not suspended. */
  buscarVigente(usuarioId: number, ahora: Date, tx?: ContextoTx): Promise<SancionUsuario | null>;
  /** Records who lifted the sanction and when; null when it does not exist. */
  levantar(id: number, levantadaPor: number, fecha: Date, tx?: ContextoTx): Promise<SancionUsuario | null>;
}
