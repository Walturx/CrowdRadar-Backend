'use strict';

/**
 * Migration 14: partial index of the demo users. The analytics read the ids of the users whose email ends in the
 * synthetic domain on every history, comparison and best-hour request (`ReporteDAOSequelize.agregarPorHora`); a leading
 * `%` LIKE cannot use a b-tree, so without this index that read scans the whole `usuario` table. PostgreSQL uses a
 * partial index when the query repeats its predicate, so the text must stay equal to DOMINIO_EMAIL_SINTETICO
 * (src/util/sintetico.ts); it is written out here because a delivered migration must not change with the code, and
 * the migration test checks that both still agree.
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(
      "CREATE INDEX ix_usuario_sintetico ON usuario (id) WHERE email LIKE '%@sintetico.crowdradar.local';",
    );
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query('DROP INDEX IF EXISTS ix_usuario_sintetico;');
  },
};
