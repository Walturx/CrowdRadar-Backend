/**
 * Contract: every domain enum that is persisted must list exactly the values the frozen
 * migration allows in its CHECK constraint. A drift here would surface only at runtime
 * as a constraint violation, so the migration SQL itself is the oracle.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CategoriaLugar } from '../../src/enum/CategoriaLugar.js';
import { EstadoDenuncia } from '../../src/enum/EstadoDenuncia.js';
import { EstadoReporte } from '../../src/enum/EstadoReporte.js';
import { FiltroDias } from '../../src/enum/FiltroDias.js';
import { MotivoDenuncia } from '../../src/enum/MotivoDenuncia.js';
import { MotivoSinPuntos } from '../../src/enum/MotivoSinPuntos.js';
import { NivelConfiabilidad } from '../../src/enum/NivelConfiabilidad.js';
import { NivelEfectivo, NivelSaturacion } from '../../src/enum/NivelSaturacion.js';
import { PlataformaPush } from '../../src/enum/PlataformaPush.js';
import { TipoAccionValidacion } from '../../src/enum/TipoAccionValidacion.js';
import { DIAS_SUSPENSION } from '../../src/entity/SancionUsuario.js';

const DIR = join(import.meta.dirname, '../../database/migrations');

/** Values listed in `CONSTRAINT <nombre> CHECK (<col> IN (...))` of a migration file. */
function valoresCheck(archivo: string, restriccion: string): string[] {
  const sql = readFileSync(join(DIR, archivo), 'utf8');
  const patron = new RegExp(String.raw`${restriccion} CHECK\s*\(\s*\w+ IN\s*\(([^)]*)\)`);
  const bloque = patron.exec(sql)?.[1];
  if (bloque === undefined) throw new Error(`CHECK ${restriccion} no encontrado en ${archivo}`);
  return bloque.split(',').map((v) => v.trim().replace(/^'|'$/g, ''));
}

const casos: [string, Record<string, string>, string, string][] = [
  ['CategoriaLugar', CategoriaLugar, '20261005000002-crear-lugar.cjs', 'ck_lugar_categoria'],
  ['NivelSaturacion (lugar)', NivelSaturacion, '20261005000002-crear-lugar.cjs', 'ck_lugar_saturacion'],
  ['NivelSaturacion (reporte)', NivelSaturacion, '20261005000003-crear-reporte-saturacion.cjs', 'ck_reporte_nivel'],
  ['NivelSaturacion (alerta)', NivelSaturacion, '20261005000008-crear-alerta.cjs', 'ck_alerta_nivel_nuevo'],
  ['EstadoReporte', EstadoReporte, '20261005000003-crear-reporte-saturacion.cjs', 'ck_reporte_estado'],
  ['MotivoSinPuntos', MotivoSinPuntos, '20261005000003-crear-reporte-saturacion.cjs', 'ck_reporte_motivo_sin_puntos'],
  ['TipoAccionValidacion', TipoAccionValidacion, '20261005000004-crear-validacion-reporte.cjs', 'ck_validacion_tipo'],
  ['MotivoDenuncia', MotivoDenuncia, '20261005000005-crear-denuncia.cjs', 'ck_denuncia_motivo'],
  ['EstadoDenuncia', EstadoDenuncia, '20261005000005-crear-denuncia.cjs', 'ck_denuncia_estado'],
  ['PlataformaPush', PlataformaPush, '20261005000010-crear-dispositivo-push.cjs', 'ck_dispositivo_plataforma'],
];

describe('enums persistidos vs CHECK de las migraciones', () => {
  it.each(casos)('%s coincide con %s', (_nombre, enumeracion, archivo, restriccion) => {
    expect(Object.values(enumeracion).sort()).toEqual(valoresCheck(archivo, restriccion).sort());
  });

  it('el parser de CHECK distingue restricciones: ck_reporte_estado no es ck_reporte_nivel', () => {
    expect(valoresCheck('20261005000003-crear-reporte-saturacion.cjs', 'ck_reporte_estado')).toEqual([
      'ACTIVO',
      'ELIMINADO',
    ]);
  });

  it('DIAS_SUSPENSION coincide con ck_sancion_dias (3, 7, 30)', () => {
    const sql = readFileSync(join(DIR, '20261005000006-crear-sancion-usuario.cjs'), 'utf8');
    const dias = /ck_sancion_dias CHECK \(dias IN \(([^)]*)\)\)/.exec(sql)?.[1]?.split(',').map(Number);
    expect([...DIAS_SUSPENSION]).toEqual(dias);
  });
});

describe('enums de dominio sin columna', () => {
  it('NivelEfectivo es NivelSaturacion mas SIN_INFORMACION', () => {
    expect(Object.values(NivelEfectivo).sort()).toEqual(
      [...Object.values(NivelSaturacion), 'SIN_INFORMACION'].sort(),
    );
  });

  it('NivelConfiabilidad cubre los cuatro resultados de la estrategia', () => {
    expect(Object.values(NivelConfiabilidad).sort()).toEqual(['ALTA', 'BAJA', 'INSUFICIENTE', 'MEDIA']);
  });

  it('FiltroDias cubre TODOS, LABORABLES y FIN_DE_SEMANA', () => {
    expect(Object.values(FiltroDias).sort()).toEqual(['FIN_DE_SEMANA', 'LABORABLES', 'TODOS']);
  });
});
