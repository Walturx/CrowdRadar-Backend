/** Page request: 1-based page and page size (the API bounds `size` to 1..50, default 20). */
export interface Paginacion {
  page: number;
  size: number;
}

/** Page of results, the `data` shape of every paginated endpoint. */
export interface Pagina<T> {
  items: T[];
  page: number;
  size: number;
  total: number;
  totalPaginas: number;
}
