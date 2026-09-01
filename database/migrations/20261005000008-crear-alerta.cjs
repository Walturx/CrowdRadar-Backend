'use strict';

/** Migration 08: alerta (design section 3). Frozen after merge. */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      CREATE TABLE alerta (
        id             SERIAL       NOT NULL,
        favorito_id    INTEGER      NOT NULL,
        usuario_id     INTEGER      NOT NULL,
        lugar_id       INTEGER      NOT NULL,
        nivel_anterior VARCHAR(10),
        nivel_nuevo    VARCHAR(10)  NOT NULL,
        mensaje        VARCHAR(200) NOT NULL,
        leida          BOOLEAN      NOT NULL DEFAULT false,
        fecha_hora     TIMESTAMPTZ  NOT NULL DEFAULT now(),
        created_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
        updated_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
        CONSTRAINT pk_alerta PRIMARY KEY (id),
        CONSTRAINT fk_alerta_favorito FOREIGN KEY (favorito_id) REFERENCES lugar_favorito (id) ON DELETE CASCADE,
        CONSTRAINT fk_alerta_usuario FOREIGN KEY (usuario_id) REFERENCES usuario (id) ON DELETE CASCADE,
        CONSTRAINT fk_alerta_lugar FOREIGN KEY (lugar_id) REFERENCES lugar (id) ON DELETE CASCADE,
        CONSTRAINT ck_alerta_nivel_anterior CHECK (nivel_anterior IN ('TRANQUILO', 'MODERADO', 'SATURADO')),
        CONSTRAINT ck_alerta_nivel_nuevo CHECK (nivel_nuevo IN ('TRANQUILO', 'MODERADO', 'SATURADO'))
      );
      CREATE INDEX ix_alerta_usuario_leida_fecha ON alerta (usuario_id, leida, fecha_hora DESC);
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query('DROP TABLE alerta;');
  },
};
