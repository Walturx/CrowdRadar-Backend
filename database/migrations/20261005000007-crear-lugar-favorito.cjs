'use strict';

/** Migration 07: lugar_favorito (design section 3). Frozen after merge. */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      CREATE TABLE lugar_favorito (
        id                SERIAL       NOT NULL,
        usuario_id        INTEGER      NOT NULL,
        lugar_id          INTEGER      NOT NULL,
        alertas_activadas BOOLEAN      NOT NULL DEFAULT true,
        created_at        TIMESTAMPTZ  NOT NULL DEFAULT now(),
        updated_at        TIMESTAMPTZ  NOT NULL DEFAULT now(),
        CONSTRAINT pk_lugar_favorito PRIMARY KEY (id),
        CONSTRAINT fk_favorito_usuario FOREIGN KEY (usuario_id) REFERENCES usuario (id) ON DELETE CASCADE,
        CONSTRAINT fk_favorito_lugar FOREIGN KEY (lugar_id) REFERENCES lugar (id) ON DELETE CASCADE,
        CONSTRAINT uq_favorito_usuario_lugar UNIQUE (usuario_id, lugar_id)
      );
      CREATE INDEX ix_favorito_lugar_alertas ON lugar_favorito (lugar_id, alertas_activadas);
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query('DROP TABLE lugar_favorito;');
  },
};
