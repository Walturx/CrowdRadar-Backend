'use strict';

/** Migration 10: dispositivo_push (design section 3). Frozen after merge. */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      CREATE TABLE dispositivo_push (
        id         SERIAL       NOT NULL,
        usuario_id INTEGER      NOT NULL,
        token_fcm  VARCHAR(255) NOT NULL,
        plataforma VARCHAR(10)  NOT NULL,
        created_at TIMESTAMPTZ  NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ  NOT NULL DEFAULT now(),
        CONSTRAINT pk_dispositivo_push PRIMARY KEY (id),
        CONSTRAINT fk_dispositivo_usuario FOREIGN KEY (usuario_id) REFERENCES usuario (id) ON DELETE CASCADE,
        CONSTRAINT uq_dispositivo_push_token UNIQUE (token_fcm),
        CONSTRAINT ck_dispositivo_plataforma CHECK (plataforma IN ('ANDROID', 'IOS'))
      );
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query('DROP TABLE dispositivo_push;');
  },
};
