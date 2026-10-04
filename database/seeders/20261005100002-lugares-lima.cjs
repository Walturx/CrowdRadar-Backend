'use strict';

const lugares = require('../data/lugares-lima.json');

/**
 * Seeds the Lima places from data/lugares-lima.json (OpenStreetMap data, ODbL,
 * (c) OpenStreetMap contributors). Idempotent upsert by osm_id; it refreshes the
 * descriptive columns but never touches saturacion_actual. M2 extends the JSON.
 */
module.exports = {
  async up(queryInterface) {
    for (const lugar of lugares) {
      await queryInterface.sequelize.query(
        `INSERT INTO lugar (osm_id, nombre, direccion, latitud, longitud, categoria)
         VALUES (:osmId, :nombre, :direccion, :latitud, :longitud, :categoria)
         ON CONFLICT (osm_id) DO UPDATE SET
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
    await queryInterface.sequelize.query('DELETE FROM lugar WHERE osm_id IN (:ids)', {
      replacements: { ids: lugares.map((lugar) => lugar.osmId) },
    });
  },
};
