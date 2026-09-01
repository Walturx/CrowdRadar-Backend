'use strict';

/** Migration 05: denuncia (design section 3). Frozen after merge. */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      CREATE TABLE denuncia (
        id           SERIAL       NOT NULL,
        reporte_id   INTEGER      NOT NULL,
        usuario_id   INTEGER      NOT NULL,
        motivo       VARCHAR(25)  NOT NULL,
        detalle      VARCHAR(280),
        estado       VARCHAR(12)  NOT NULL DEFAULT 'PENDIENTE',
        fecha_hora   TIMESTAMPTZ  NOT NULL DEFAULT now(),
        resuelta_por INTEGER,
        resuelta_en  TIMESTAMPTZ,
        created_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
        updated_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
        CONSTRAINT pk_denuncia PRIMARY KEY (id),
        CONSTRAINT fk_denuncia_reporte FOREIGN KEY (reporte_id) REFERENCES reporte_saturacion (id) ON DELETE CASCADE,
        CONSTRAINT fk_denuncia_usuario FOREIGN KEY (usuario_id) REFERENCES usuario (id) ON DELETE CASCADE,
        CONSTRAINT fk_denuncia_resuelta_por FOREIGN KEY (resuelta_por) REFERENCES usuario (id) ON DELETE SET NULL,
        CONSTRAINT uq_denuncia_reporte_usuario UNIQUE (reporte_id, usuario_id),
        CONSTRAINT ck_denuncia_motivo CHECK (motivo IN
          ('INFORMACION_FALSA', 'SPAM', 'CONTENIDO_INAPROPIADO', 'OTRO')),
        CONSTRAINT ck_denuncia_detalle_otro CHECK
          (motivo <> 'OTRO' OR (detalle IS NOT NULL AND length(btrim(detalle)) > 0)),
        CONSTRAINT ck_denuncia_estado CHECK (estado IN ('PENDIENTE', 'PROCEDENTE', 'DESESTIMADA'))
      );
      CREATE INDEX ix_denuncia_estado_reporte ON denuncia (estado, reporte_id);
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query('DROP TABLE denuncia;');
  },
};
