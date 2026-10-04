/** Grouping of GET /api/lugares/:id/historial: by hour of day or by calendar day. */
export const AgrupacionHistorial = {
  HORA: 'HORA',
  DIA: 'DIA',
} as const;

export type AgrupacionHistorial = (typeof AgrupacionHistorial)[keyof typeof AgrupacionHistorial];
