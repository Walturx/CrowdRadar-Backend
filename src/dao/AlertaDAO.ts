import type { ContextoTx } from '../datasource/ConexionBD.js';
import type { Alerta } from '../entity/Alerta.js';
import type { NivelSaturacion } from '../enum/NivelSaturacion.js';
import type { Pagina, Paginacion } from './Paginacion.js';

export interface NuevaAlerta {
  favoritoId: number;
  usuarioId: number;
  lugarId: number;
  nivelAnterior: NivelSaturacion | null;
  nivelNuevo: NivelSaturacion;
  /** At most 200 characters. */
  mensaje: string;
  fechaHora: Date;
}

/** Pattern: DAO (port). Persistence contract for `alerta`. Owner: M3. Every read is scoped to the owning user. */
export interface AlertaDAO {
  /** Inserts an unread alert. */
  crear(datos: NuevaAlerta, tx?: ContextoTx): Promise<Alerta>;
  /** Alerts of the user, newest first. */
  listarPorUsuario(usuarioId: number, paginacion: Paginacion, tx?: ContextoTx): Promise<Pagina<Alerta>>;
  /** Idempotent; null when the alert does not exist or belongs to someone else. */
  marcarLeida(id: number, usuarioId: number, tx?: ContextoTx): Promise<Alerta | null>;
  contarNoLeidas(usuarioId: number, tx?: ContextoTx): Promise<number>;
}
