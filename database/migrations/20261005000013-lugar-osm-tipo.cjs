'use strict';

/**
 * Migration 13: lugar.osm_tipo. An OpenStreetMap id is only unique within its element type (a node and a way
 * can share the number), so the natural key of a place is (osm_tipo, osm_id). Existing rows become 'node'.
 * Numbered 13 because 11 was never delivered and 12 (usuario.password_cambiada_en) already is.
 * `down` fails when two rows share an osm_id with different types (the old unique key cannot hold them): delete
 * one of them first.
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE lugar ADD COLUMN osm_tipo VARCHAR(8) NOT NULL DEFAULT 'node';
      ALTER TABLE lugar ADD CONSTRAINT ck_lugar_osm_tipo CHECK (osm_tipo IN ('node', 'way', 'relation'));
      ALTER TABLE lugar DROP CONSTRAINT uq_lugar_osm_id;
      ALTER TABLE lugar ADD CONSTRAINT uq_lugar_osm UNIQUE (osm_tipo, osm_id);
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE lugar DROP CONSTRAINT uq_lugar_osm;
      ALTER TABLE lugar ADD CONSTRAINT uq_lugar_osm_id UNIQUE (osm_id);
      ALTER TABLE lugar DROP CONSTRAINT ck_lugar_osm_tipo;
      ALTER TABLE lugar DROP COLUMN osm_tipo;
    `);
  },
};
