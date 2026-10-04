'use strict';

/** Migration 04: validacion_reporte (design section 3). Frozen after merge. */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      CREATE TABLE validacion_reporte (
        id               SERIAL       NOT NULL,
        reporte_id       INTEGER      NOT NULL,
        usuario_id       INTEGER      NOT NULL,
        tipo_accion      VARCHAR(10)  NOT NULL,
        karma_votante    INTEGER      NOT NULL,
        puntos_otorgados SMALLINT     NOT NULL DEFAULT 0,
        fecha_hora       TIMESTAMPTZ  NOT NULL DEFAULT now(),
        created_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
        updated_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
        CONSTRAINT pk_validacion_reporte PRIMARY KEY (id),
        CONSTRAINT fk_validacion_reporte FOREIGN KEY (reporte_id) REFERENCES reporte_saturacion (id) ON DELETE CASCADE,
        CONSTRAINT fk_validacion_usuario FOREIGN KEY (usuario_id) REFERENCES usuario (id) ON DELETE CASCADE,
        CONSTRAINT uq_validacion_reporte_usuario UNIQUE (reporte_id, usuario_id),
        CONSTRAINT ck_validacion_tipo CHECK (tipo_accion IN ('CONFIRMAR', 'RECHAZAR')),
        CONSTRAINT ck_validacion_karma CHECK (karma_votante >= 0),
        CONSTRAINT ck_validacion_puntos CHECK (puntos_otorgados >= 0)
      );
      CREATE INDEX ix_validacion_usuario ON validacion_reporte (usuario_id);
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query('DROP TABLE validacion_reporte;');
  },
};
