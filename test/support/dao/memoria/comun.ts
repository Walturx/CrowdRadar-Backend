import { ForeignKeyConstraintError } from 'sequelize';
import { relojSistema, type Reloj } from '../../../../src/util/Reloj.js';
import type { SembradorMemoria, TipoFilaReferenciada } from './SembradorMemoria.js';

/** Options shared by every in-memory DAO. */
export interface OpcionesMemoria {
  /** Source of `createdAt`/`updatedAt`; defaults to the system clock. Tests inject `RelojFijo`. */
  reloj?: Reloj;
  /**
   * Registry of the rows the test seeded. When present the DAO enforces its foreign keys like the database
   * does (throws `ForeignKeyConstraintError`, the error Sequelize raises for SQLSTATE 23503).
   */
  sembrador?: SembradorMemoria;
}

/** Snapshot of a row: callers get a copy, so mutating it never alters the store (the database behaves so). */
export const copia = <T>(valor: T): T => structuredClone(valor);

/** `createdAt` and `updatedAt` of a new row: distinct Date instances so mutating one never moves the other. */
export function sellosNuevos(reloj: Reloj = relojSistema): { createdAt: Date; updatedAt: Date } {
  const ahora = reloj.ahora();
  return { createdAt: ahora, updatedAt: new Date(ahora) };
}

/** Throws the FK violation the database would raise when the referenced row does not exist. */
export function exigirReferencia(
  sembrador: SembradorMemoria | undefined,
  tipo: TipoFilaReferenciada,
  campo: string,
  id: number,
  tabla: string,
): void {
  if (!sembrador || sembrador.existe(tipo, id)) return;
  throw new ForeignKeyConstraintError({
    message: `insert or update on table "${tabla}" violates foreign key constraint on ${campo}`,
    table: tabla,
    fields: { [campo]: String(id) },
    value: id,
  });
}
