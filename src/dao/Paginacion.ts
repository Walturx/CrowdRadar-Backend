/** Page request: 1-based page and page size (the API bounds `size` to 1..50, default 20). */
export interface Paginacion {
  page: number;
  size: number;
}

/**
 * Page of results, the `data` shape of every paginated endpoint.
 *
 * Ordering rule for every paginated DAO method: the documented sort key and then `id` as the last tie-break
 * (SQL implementations must `ORDER BY <key>, id`, e.g. `fecha_hora DESC, id DESC`), otherwise rows that tie on
 * the key can repeat or vanish between pages. A page past the end is an empty `items` with the real `total`.
 * The shared check is `test/dao/paginacion.contract.ts`.
 */
export interface Pagina<T> {
  items: T[];
  page: number;
  size: number;
  total: number;
  totalPaginas: number;
}

/** Row offset of a 1-based page. */
export const desplazamiento = ({ page, size }: Paginacion): number => (page - 1) * size;

/** Builds the page envelope from one slice of items and the total row count. */
export function armarPagina<T>(items: T[], total: number, { page, size }: Paginacion): Pagina<T> {
  return { items, page, size, total, totalPaginas: Math.ceil(total / size) };
}
