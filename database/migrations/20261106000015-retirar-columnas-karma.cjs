'use strict';

/**
 * Migration 15: drops the five point columns that CRO-72 stopped using, with their CHECKs (decision of 06/11/2026, see
 * docs/decisiones.md, D-CRO-72-COLUMNAS; it replaces the CRO-62 "se dejan de usar, no se borran"). Points are computed by
 * a query since CRO-72, so nothing reads them:
 * - usuario.puntos_karma (migration 01)
 * - reporte_saturacion.puntos_otorgados and motivo_sin_puntos (migration 03)
 * - validacion_reporte.karma_votante and puntos_otorgados (migration 04)
 *
 * One transaction: either the five columns go or none does. No CASCADE: an object that depends on a column (a view, an
 * index made by hand) stops the migration instead of being dropped with it. DROP COLUMN only changes the catalog (no table
 * rewrite), but it takes an ACCESS EXCLUSIVE lock on the three tables for that instant.
 *
 * Deploy order: the code of this change first, then this migration, right after (docs/decisiones.md explains the window).
 *
 * `down` restores the shape, not the data: the columns come back with their original type, default, NOT NULL and CHECK
 * (at the end of each table), every row holding the neutral value (0, or NULL for motivo_sin_puntos). `karma_votante` had
 * no default in migration 04; it is added with DEFAULT 0 so existing votes get a value, and the default is then dropped.
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.sequelize.query(
        `
        ALTER TABLE usuario
          DROP CONSTRAINT ck_usuario_puntos_karma,
          DROP COLUMN puntos_karma;
        ALTER TABLE reporte_saturacion
          DROP CONSTRAINT ck_reporte_puntos,
          DROP CONSTRAINT ck_reporte_motivo_sin_puntos,
          DROP COLUMN puntos_otorgados,
          DROP COLUMN motivo_sin_puntos;
        ALTER TABLE validacion_reporte
          DROP CONSTRAINT ck_validacion_karma,
          DROP CONSTRAINT ck_validacion_puntos,
          DROP COLUMN karma_votante,
          DROP COLUMN puntos_otorgados;
        `,
        { transaction },
      );
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.sequelize.query(
        `
        ALTER TABLE usuario
          ADD COLUMN puntos_karma INTEGER NOT NULL DEFAULT 0,
          ADD CONSTRAINT ck_usuario_puntos_karma CHECK (puntos_karma >= 0);
        ALTER TABLE reporte_saturacion
          ADD COLUMN puntos_otorgados SMALLINT NOT NULL DEFAULT 0,
          ADD COLUMN motivo_sin_puntos VARCHAR(20),
          ADD CONSTRAINT ck_reporte_puntos CHECK (puntos_otorgados >= 0),
          ADD CONSTRAINT ck_reporte_motivo_sin_puntos CHECK (motivo_sin_puntos IN ('TOPE_DIARIO', 'REPORTE_ELIMINADO'));
        ALTER TABLE validacion_reporte
          ADD COLUMN karma_votante INTEGER NOT NULL DEFAULT 0,
          ADD COLUMN puntos_otorgados SMALLINT NOT NULL DEFAULT 0,
          ADD CONSTRAINT ck_validacion_karma CHECK (karma_votante >= 0),
          ADD CONSTRAINT ck_validacion_puntos CHECK (puntos_otorgados >= 0);
        ALTER TABLE validacion_reporte ALTER COLUMN karma_votante DROP DEFAULT;
        `,
        { transaction },
      );
    });
  },
};
