/**
 * Pagination edge cases every paginated DAO method must honour (R3-507). SQL implementations must
 * `ORDER BY <sort key>, id` so rows that tie on the sort key (same `fechaHora`) page deterministically.
 */
import { expect, it } from 'vitest';
import type { Pagina, Paginacion } from '../../src/dao/Paginacion.js';

export type ListarPagina = (paginacion: Paginacion) => Promise<Pagina<{ id: number }>>;

/**
 * @param nombre   method under test, used in the test titles
 * @param preparar inserts exactly 3 rows that tie on the sort key (newest first, id DESC) and returns the lister
 */
export function casosPaginacion(nombre: string, preparar: () => Promise<ListarPagina>): void {
  it(`${nombre}: una pagina mas alla del final es vacia pero conserva total y totalPaginas`, async () => {
    const listar = await preparar();
    expect(await listar({ page: 5, size: 2 })).toMatchObject({ items: [], page: 5, size: 2, total: 3, totalPaginas: 2 });
  });

  it(`${nombre}: size mayor que el total devuelve todo en una sola pagina`, async () => {
    const listar = await preparar();
    const pagina = await listar({ page: 1, size: 50 });
    expect(pagina).toMatchObject({ total: 3, totalPaginas: 1 });
    expect(pagina.items).toHaveLength(3);
  });

  it(`${nombre}: con empate en la clave de orden desempata por id DESC y las paginas no repiten ni pierden filas`, async () => {
    const listar = await preparar();
    const primera = await listar({ page: 1, size: 2 });
    const segunda = await listar({ page: 2, size: 2 });
    const ids = [...primera.items, ...segunda.items].map((x) => x.id);
    expect(ids).toEqual([...ids].sort((a, b) => b - a));
    expect(new Set(ids).size).toBe(3);
  });
}
