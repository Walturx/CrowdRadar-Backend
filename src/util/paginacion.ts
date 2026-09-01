import type { Pagina, Paginacion } from '../dao/Paginacion.js';

/** Row offset of a 1-based page. */
export const desplazamiento = ({ page, size }: Paginacion): number => (page - 1) * size;

/** Builds the page envelope from one slice of items and the total row count. */
export function armarPagina<T>(items: T[], total: number, { page, size }: Paginacion): Pagina<T> {
  return { items, page, size, total, totalPaginas: Math.ceil(total / size) };
}
