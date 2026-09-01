'use strict';

/** Migration 03: reporte_saturacion (design section 3). Frozen after merge. */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      CREATE TABLE reporte_saturacion (
        id                  SERIAL       NOT NULL,
        usuario_id          INTEGER      NOT NULL,
        lugar_id            INTEGER      NOT NULL,
        nivel_saturacion    VARCHAR(10)  NOT NULL,
        fecha_hora          TIMESTAMPTZ  NOT NULL DEFAULT now(),
        nivel_confiabilidad NUMERIC(5,2),
        estado              VARCHAR(10)  NOT NULL DEFAULT 'ACTIVO',
        puntos_otorgados    SMALLINT     NOT NULL DEFAULT 0,
        motivo_sin_puntos   VARCHAR(20),
        created_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
        updated_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
        CONSTRAINT pk_reporte_saturacion PRIMARY KEY (id),
        CONSTRAINT fk_reporte_usuario FOREIGN KEY (usuario_id) REFERENCES usuario (id) ON DELETE RESTRICT,
        CONSTRAINT fk_reporte_lugar FOREIGN KEY (lugar_id) REFERENCES lugar (id) ON DELETE RESTRICT,
        CONSTRAINT ck_reporte_nivel CHECK (nivel_saturacion IN ('TRANQUILO', 'MODERADO', 'SATURADO')),
        CONSTRAINT ck_reporte_confiabilidad CHECK (nivel_confiabilidad BETWEEN 0 AND 100),
        CONSTRAINT ck_reporte_estado CHECK (estado IN ('ACTIVO', 'ELIMINADO')),
        CONSTRAINT ck_reporte_puntos CHECK (puntos_otorgados >= 0),
        CONSTRAINT ck_reporte_motivo_sin_puntos CHECK (motivo_sin_puntos IN ('TOPE_DIARIO', 'REPORTE_ELIMINADO'))
      );
      CREATE INDEX ix_reporte_lugar_fecha ON reporte_saturacion (lugar_id, fecha_hora DESC);
      CREATE INDEX ix_reporte_usuario_lugar_fecha ON reporte_saturacion (usuario_id, lugar_id, fecha_hora DESC);
      CREATE INDEX ix_reporte_usuario_fecha ON reporte_saturacion (usuario_id, fecha_hora DESC);
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query('DROP TABLE reporte_saturacion;');
  },
};
