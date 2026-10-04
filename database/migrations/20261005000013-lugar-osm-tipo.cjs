'use strict';

/**
 * Migration 13: lugar.osm_tipo. An OpenStreetMap id is only unique within its element type (a node and a way
 * can share the number), so the natural key of a place is (osm_tipo, osm_id). Existing rows become 'node'
 * except the C0-seeded places that are not nodes, which get their real type (a wrong 'node' would make the
 * 45-place seeder insert a duplicate next to them and orphan their favoritos and reportes).
 * Numbered 13 because 11 was never delivered and 12 (usuario.password_cambiada_en) already is.
 * `down` fails, listing them, when two rows share an osm_id with different types (the old unique key cannot
 * hold them): delete one of each pair first (see the README runbook).
 */

/** Types of the C0-seeded places that are not nodes (verified against OpenStreetMap, see database/data). */
const TIPO_REAL_DE_C0 = { relation: [3570374], way: [28993402, 44364378, 396258998] };

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE lugar ADD COLUMN osm_tipo VARCHAR(8) NOT NULL DEFAULT 'node';
      ALTER TABLE lugar ADD CONSTRAINT ck_lugar_osm_tipo CHECK (osm_tipo IN ('node', 'way', 'relation'));
      ALTER TABLE lugar DROP CONSTRAINT uq_lugar_osm_id;
      ALTER TABLE lugar ADD CONSTRAINT uq_lugar_osm UNIQUE (osm_tipo, osm_id);
    `);
    for (const [osmTipo, ids] of Object.entries(TIPO_REAL_DE_C0)) {
      await queryInterface.sequelize.query('UPDATE lugar SET osm_tipo = :osmTipo WHERE osm_id IN (:ids)', {
        replacements: { osmTipo, ids },
      });
    }
  },

  async down(queryInterface) {
    const [repetidos] = await queryInterface.sequelize.query(
      `SELECT osm_id, string_agg(osm_tipo, ', ' ORDER BY osm_tipo) AS tipos
         FROM lugar GROUP BY osm_id HAVING count(*) > 1 ORDER BY osm_id`,
    );
    if (repetidos.length > 0) {
      const lista = repetidos.map((fila) => `osm_id ${fila.osm_id} (${fila.tipos})`).join('; ');
      throw new Error(
        `Cannot undo lugar.osm_tipo: these osm_id exist with several types and the old unique key on osm_id cannot hold them: ${lista}. Delete or merge all but one row of each (README, "Undoing migration 13"), then retry.`,
      );
    }
    await queryInterface.sequelize.query(`
      ALTER TABLE lugar DROP CONSTRAINT uq_lugar_osm;
      ALTER TABLE lugar ADD CONSTRAINT uq_lugar_osm_id UNIQUE (osm_id);
      ALTER TABLE lugar DROP CONSTRAINT ck_lugar_osm_tipo;
      ALTER TABLE lugar DROP COLUMN osm_tipo;
    `);
  },
};
