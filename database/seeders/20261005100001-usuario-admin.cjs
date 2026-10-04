'use strict';

const bcrypt = require('bcrypt');

/**
 * Seeds the admin user from ADMIN_EMAIL / ADMIN_PASSWORD. Idempotent: an existing
 * row with the same email is left untouched (ON CONFLICT DO NOTHING).
 */
module.exports = {
  async up(queryInterface) {
    const email = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
    const password = process.env.ADMIN_PASSWORD || '';
    if (!email || !password) {
      throw new Error('ADMIN_EMAIL y ADMIN_PASSWORD son obligatorios para sembrar el usuario administrador.');
    }
    const costo = Number(process.env.BCRYPT_COSTO || 10);
    const hash = await bcrypt.hash(password, costo);

    await queryInterface.sequelize.query(
      `INSERT INTO usuario (nombre, apellido, email, password_hash, rol, status)
       VALUES ('Administrador', 'CrowdRadar', :email, :hash, 'ADMIN', 'ACTIVO')
       ON CONFLICT (email) DO NOTHING`,
      { replacements: { email, hash } },
    );
  },

  async down(queryInterface) {
    const email = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
    if (!email) return;
    await queryInterface.sequelize.query(`DELETE FROM usuario WHERE email = :email AND rol = 'ADMIN'`, {
      replacements: { email },
    });
  },
};
