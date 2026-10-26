/** Level as the app reads it: the three stored levels, or SIN_INFORMACION when the place had none before. */
export type NivelAlertaResponse = 'TRANQUILO' | 'MODERADO' | 'SATURADO' | 'SIN_INFORMACION';

export interface AlertaResponseDTO {
  id: number;
  lugarId: number;
  lugarNombre: string;
  nivelAnterior: NivelAlertaResponse;
  nivelNuevo: NivelAlertaResponse;
  mensaje: string;
  leida: boolean;
  /** ISO-8601 UTC. */
  fechaHora: string;
}

/** `data` of GET /api/alertas: the shared page envelope plus the total unread count. */
export interface ListadoAlertasResponseDTO {
  items: AlertaResponseDTO[];
  page: number;
  size: number;
  total: number;
  totalPaginas: number;
  noLeidas: number;
}
