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

/** Prefix of the replacement names the statements add themselves (`:__id`, `:__ahora`); no model attribute has it. */
export const PREFIJO_INTERNO = '__';

/**
 * SET list of a hand-written `UPDATE ... RETURNING`: `"column" = :attribute` per change, with the values keyed by
 * attribute. `undefined` values are dropped (they mean "leave the column as is"; Sequelize would otherwise reject the
 * missing replacement); null when nothing is left, so the caller sends no UPDATE at all. An attribute with the
 * internal prefix is rejected, so a change can never overwrite the statement's own replacements.
 */
export function asignacionesDe(
  cambios: Record<string, unknown>,
  campo: (atributo: string) => string,
): { set: string; valores: Record<string, unknown> } | null {
  const pares = Object.entries(cambios).filter(([, valor]) => valor !== undefined);
  if (pares.length === 0) return null;
  const reservado = pares.find(([atributo]) => atributo.startsWith(PREFIJO_INTERNO));
  if (reservado) throw new Error(`Atributo reservado ${reservado[0]}: el prefijo ${PREFIJO_INTERNO} es de los reemplazos internos`);
  return { set: pares.map(([atributo]) => `"${campo(atributo)}" = :${atributo}`).join(', '), valores: Object.fromEntries(pares) };
}

/** Column name of an attribute (e.g. `puntosOtorgados` -> `puntos_otorgados`). Attribute names come from code, never input. */
export function campoDe(modelo: ModelStatic<Model>, atributo: string): string {
  const par = campos(modelo).find(([nombre]) => nombre === atributo);
  if (!par) throw new Error(`Atributo desconocido ${modelo.name}.${atributo}`);
  return par[1];
}
