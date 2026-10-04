'use strict';

/** Migration 09: token_recuperacion (design section 3). Frozen after merge. */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      CREATE TABLE token_recuperacion (
        id         SERIAL       NOT NULL,
        usuario_id INTEGER      NOT NULL,
        token_hash CHAR(64)     NOT NULL,
        expira_en  TIMESTAMPTZ  NOT NULL,
        usado_en   TIMESTAMPTZ,
        created_at TIMESTAMPTZ  NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ  NOT NULL DEFAULT now(),
        CONSTRAINT pk_token_recuperacion PRIMARY KEY (id),
        CONSTRAINT fk_token_usuario FOREIGN KEY (usuario_id) REFERENCES usuario (id) ON DELETE CASCADE,
        CONSTRAINT uq_token_recuperacion_hash UNIQUE (token_hash)
      );
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query('DROP TABLE token_recuperacion;');
  },
};
