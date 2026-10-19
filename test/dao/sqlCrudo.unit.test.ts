/** asignacionesDe: the SET list of the hand-written UPDATE ... RETURNING statements (sqlCrudo.ts), without a database. */
import { describe, expect, it } from 'vitest';
import { asignacionesDe } from '../../src/dao/impl/sequelize/sqlCrudo.js';

const COLUMNAS: Record<string, string> = { puntosOtorgados: 'puntos_otorgados', motivoSinPuntos: 'motivo_sin_puntos', estado: 'estado' };
const campo = (atributo: string) => {
  const columna = COLUMNAS[atributo];
  if (!columna) throw new Error(`Atributo desconocido ${atributo}`);
  return columna;
};

describe('asignacionesDe', () => {
  it('arma "columna" = :atributo por cada cambio y pasa los valores con el nombre del atributo', () => {
    expect(asignacionesDe({ puntosOtorgados: 5, motivoSinPuntos: null }, campo)).toEqual({
      set: '"puntos_otorgados" = :puntosOtorgados, "motivo_sin_puntos" = :motivoSinPuntos',
      valores: { puntosOtorgados: 5, motivoSinPuntos: null },
    });
  });

  it('descarta los undefined (dejar la columna como esta); null si se escribe', () => {
    expect(asignacionesDe({ puntosOtorgados: 5, motivoSinPuntos: undefined }, campo)).toEqual({
      set: '"puntos_otorgados" = :puntosOtorgados',
      valores: { puntosOtorgados: 5 },
    });
  });

  it('sin nada que cambiar devuelve null (el llamador no envia UPDATE)', () => {
    expect(asignacionesDe({}, campo)).toBeNull();
    expect(asignacionesDe({ estado: undefined }, campo)).toBeNull();
  });

  it('un atributo con el prefijo reservado __ (los reemplazos internos) se rechaza: no puede pisar :__id ni :__ahora', () => {
    expect(() => asignacionesDe({ __id: 7 }, (a) => a)).toThrow(/reservado/);
  });

  it('un atributo desconocido falla en el resolutor de columnas', () => {
    expect(() => asignacionesDe({ inventado: 1 }, campo)).toThrow(/desconocido/);
  });
});
