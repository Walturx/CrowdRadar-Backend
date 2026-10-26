import { QueryTypes } from 'sequelize';
import type { ResolverNombresLugar } from '../../ResolverNombresLugar.js';
import { AlertaModel } from './model/AlertaModel.js';

/**
 * Production ResolverNombresLugar: one read of `lugar.nombre` for the given ids. It stands in until the places
 * DAO (M2) is wired into the composition root; then `resolverNombresDesde(lugarDAO)` replaces it.
 */
export const nombresLugarSequelize: ResolverNombresLugar = async (ids) => {
  if (ids.length === 0) return new Map();
  const filas = await AlertaModel.sequelize!.query<{ id: number; nombre: string }>(
    'SELECT id, nombre FROM lugar WHERE id IN (:ids)',
    { replacements: { ids: [...new Set(ids)] }, type: QueryTypes.SELECT },
  );
  return new Map(filas.map((fila) => [fila.id, fila.nombre]));
};
