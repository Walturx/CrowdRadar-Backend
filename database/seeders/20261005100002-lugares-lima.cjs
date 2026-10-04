'use strict';

const lugares = require('../data/lugares-lima.json');

/**
 * Seeds the 45 Lima places from data/lugares-lima.json (OpenStreetMap data, ODbL,
 * (c) OpenStreetMap contributors; produced once by scripts/exportar-lugares-osm.ts). Idempotent upsert by
 * (osm_tipo, osm_id); it refreshes the descriptive columns but never touches saturacion_actual. All upserts
 * run in one transaction, so a failure leaves the table as it was.
 * A row seeded before osm_tipo existed carries the default 'node'; when the JSON says another type, that row
 * gets the real type (keeping its id, favoritos, reportes and saturation) instead of a duplicate being inserted.
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      for (const lugar of lugares) {
        const replacements = { direccion: null, ...lugar };
        await queryInterface.sequelize.query(
          `UPDATE lugar SET osm_tipo = :osmTipo, updated_at = now()
            WHERE osm_id = :osmId AND osm_tipo = 'node' AND :osmTipo <> 'node'
              AND NOT EXISTS (SELECT 1 FROM lugar WHERE osm_id = :osmId AND osm_tipo = :osmTipo)`,
          { replacements, transaction },
        );
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
          { replacements, transaction },
        );
      }
    });
  },

  async down(queryInterface) {
    for (const { osmTipo, osmId } of lugares) {
      await queryInterface.sequelize.query('DELETE FROM lugar WHERE osm_tipo = :osmTipo AND osm_id = :osmId', {
        replacements: { osmTipo, osmId },
      });
    }
  },
};
