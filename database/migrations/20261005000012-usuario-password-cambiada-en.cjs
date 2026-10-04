'use strict';

/**
 * Migration 12: usuario.password_cambiada_en. Set whenever the password changes; `autenticar` rejects
 * tokens issued before it, so a stolen token stops working after the owner changes the password.
 * Nullable: NULL means "never changed", every existing token stays valid.
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query('ALTER TABLE usuario ADD COLUMN password_cambiada_en TIMESTAMPTZ;');
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query('ALTER TABLE usuario DROP COLUMN password_cambiada_en;');
  },
};
