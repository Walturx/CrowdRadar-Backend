'use strict';

const lugares = require('../data/lugares-lima.json');

/**
 * Seeds the 45 Lima places from data/lugares-lima.json (OpenStreetMap data, ODbL,
 * (c) OpenStreetMap contributors; produced once by scripts/exportar-lugares-osm.ts). Idempotent upsert by
 * (osm_tipo, osm_id); it refreshes the descriptive columns but never touches saturacion_actual.
 */
module.exports = {
  async up(queryInterface) {
    for (const lugar of lugares) {
      await queryInterface.sequelize.query(
        `INSERT INTO lugar (osm_tipo, osm_id, nombre, direccion, latitud, longitud, categoria)
         VALUES (:osmTipo, :osmId, :nombre, :direccion, :latitud, :longitud, :categoria)
         ON CONFLICT (osm_tipo, osm_id) DO UPDATE SET
           nombre = EXCLUDED.nombre,
           direccion = EXCLUDED.direccion,
           latitud = EXCLUDED.latitud,
           longitud = EXCLUDED.longitud,
           categoria = EXCLUDED.categoria,
           updated_at = now()`,
        { replacements: { direccion: null, ...lugar } },
      );
    }
  },

  async down(queryInterface) {
    for (const { osmTipo, osmId } of lugares) {
      await queryInterface.sequelize.query('DELETE FROM lugar WHERE osm_tipo = :osmTipo AND osm_id = :osmId', {
        replacements: { osmTipo, osmId },
      });
    }
  },
};
