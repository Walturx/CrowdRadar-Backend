/**
 * The single rule for matching and ordering place names (search `q`, ORDER BY nombre).
 *
 * Normalising maps every letter of CON_ACENTO to its counterpart in SIN_ACENTO and nothing else: the Spanish
 * accented letters lose the accent and the ASCII capitals become lower case. Any other character (a Polish `Ł`,
 * punctuation, digits, spaces) is compared as is. LugarDAOSequelize hands the two alphabets to PostgreSQL
 * `translate()`, which does exactly this one-to-one mapping without depending on the database locale or on
 * an extension (`unaccent`); LugarDAOMemoria calls `normalizarNombre`. Keep them equal in length.
 */
const MINUSCULAS = 'abcdefghijklmnopqrstuvwxyz';

/** Letters that are rewritten: accented Spanish letters (both cases), then the ASCII capitals. */
export const CON_ACENTO = `ÁÀÂÄÉÈÊËÍÌÎÏÓÒÔÖÚÙÛÜÑÇáàâäéèêëíìîïóòôöúùûüñç${MINUSCULAS.toUpperCase()}`;
/** What each letter of CON_ACENTO becomes, position by position. */
export const SIN_ACENTO = `aaaaeeeeiiiioooouuuuncaaaaeeeeiiiioooouuuunc${MINUSCULAS}`;

const EQUIVALENTE = new Map([...CON_ACENTO].map((letra, i) => [letra, [...SIN_ACENTO][i] as string]));

export const normalizarNombre = (texto: string): string => [...texto].map((letra) => EQUIVALENTE.get(letra) ?? letra).join('');

/**
 * Order of normalised names: by code point, the same as PostgreSQL `COLLATE "C"` on UTF-8 (byte order). A plain
 * `<` on JavaScript strings compares UTF-16 units and would put astral characters before U+E000-U+FFFF.
 */
export const compararNombres = (a: string, b: string): number => Buffer.compare(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'));
