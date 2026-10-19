import type { Model, ModelStatic } from 'sequelize';

/**
 * Helpers for the hand-written SQL of the hot paths (report transaction, auth user read, place reads). Model methods
 * (findByPk, create, update, count) build every statement through Sequelize's query generator, which showed up as the
 * largest CPU cost of POST /api/reportes under load; a fixed SQL string through `sequelize.query` skips it. The column
 * lists come from the model definitions, so a row of these queries has the same keys as a `raw: true` row and goes
 * through the same `aEntidad*` mapper.
 */
const columnas = new Map<string, string>();

/** Attribute name -> column name of the model. */
function campos(modelo: ModelStatic<Model>): [string, string][] {
  return Object.entries(modelo.getAttributes() as Record<string, { field?: string }>).map(([atributo, definicion]) => [
    atributo,
    definicion.field ?? atributo,
  ]);
}

/** `"field" AS "attribute", ...` of every attribute of the model, cached per model. */
export function columnasDe(modelo: ModelStatic<Model>): string {
  let lista = columnas.get(modelo.name);
  if (lista === undefined) {
    lista = campos(modelo)
      .map(([atributo, campo]) => `"${campo}" AS "${atributo}"`)
      .join(', ');
    columnas.set(modelo.name, lista);
  }
  return lista;
}

/** Column name of an attribute (e.g. `puntosOtorgados` -> `puntos_otorgados`). Attribute names come from code, never input. */
export function campoDe(modelo: ModelStatic<Model>, atributo: string): string {
  const par = campos(modelo).find(([nombre]) => nombre === atributo);
  if (!par) throw new Error(`Atributo desconocido ${modelo.name}.${atributo}`);
  return par[1];
}
