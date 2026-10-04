'use strict';

/** Migration 06: sancion_usuario (design section 3). Frozen after merge. */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      CREATE TABLE sancion_usuario (
        id                  SERIAL       NOT NULL,
        usuario_id          INTEGER      NOT NULL,
        administrador_id    INTEGER      NOT NULL,
        tipo                VARCHAR(25)  NOT NULL DEFAULT 'SUSPENSION_TEMPORAL',
        dias                SMALLINT     NOT NULL,
        motivo              VARCHAR(280) NOT NULL,
        fecha_inicio        TIMESTAMPTZ  NOT NULL DEFAULT now(),
        fecha_fin           TIMESTAMPTZ  NOT NULL,
        fecha_levantamiento TIMESTAMPTZ,
        levantada_por       INTEGER,
        created_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
        updated_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
        CONSTRAINT pk_sancion_usuario PRIMARY KEY (id),
        CONSTRAINT fk_sancion_usuario FOREIGN KEY (usuario_id) REFERENCES usuario (id) ON DELETE CASCADE,
        CONSTRAINT fk_sancion_administrador FOREIGN KEY (administrador_id) REFERENCES usuario (id) ON DELETE RESTRICT,
        CONSTRAINT fk_sancion_levantada_por FOREIGN KEY (levantada_por) REFERENCES usuario (id) ON DELETE SET NULL,
        CONSTRAINT ck_sancion_tipo CHECK (tipo IN ('SUSPENSION_TEMPORAL')),
        CONSTRAINT ck_sancion_dias CHECK (dias IN (3, 7, 30)),
        CONSTRAINT ck_sancion_fechas CHECK (fecha_fin > fecha_inicio)
      );
      CREATE INDEX ix_sancion_usuario_fin ON sancion_usuario (usuario_id, fecha_fin DESC);
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query('DROP TABLE sancion_usuario;');
  },
};
