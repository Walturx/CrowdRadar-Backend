'use strict';

/** Migration 02: lugar (design section 3). Frozen after merge. */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      CREATE TABLE lugar (
        id                        SERIAL        NOT NULL,
        osm_id                    BIGINT,
        nombre                    VARCHAR(120)  NOT NULL,
        direccion                 VARCHAR(200),
        latitud                   NUMERIC(9,6)  NOT NULL,
        longitud                  NUMERIC(9,6)  NOT NULL,
        categoria                 VARCHAR(20)   NOT NULL,
        saturacion_actual         VARCHAR(10),
        saturacion_actualizada_en TIMESTAMPTZ,
        horario_atencion          VARCHAR(60),
        hora_apertura             SMALLINT,
        hora_cierre               SMALLINT,
        url_foto                  VARCHAR(300),
        created_at                TIMESTAMPTZ   NOT NULL DEFAULT now(),
        updated_at                TIMESTAMPTZ   NOT NULL DEFAULT now(),
        CONSTRAINT pk_lugar PRIMARY KEY (id),
        CONSTRAINT uq_lugar_osm_id UNIQUE (osm_id),
        CONSTRAINT ck_lugar_latitud CHECK (latitud BETWEEN -90 AND 90),
        CONSTRAINT ck_lugar_longitud CHECK (longitud BETWEEN -180 AND 180),
        CONSTRAINT ck_lugar_categoria CHECK (categoria IN
          ('PARQUE', 'CENTRO_COMERCIAL', 'MERCADO', 'TRANSPORTE', 'PLAZA', 'PLAYA')),
        CONSTRAINT ck_lugar_saturacion CHECK (saturacion_actual IN ('TRANQUILO', 'MODERADO', 'SATURADO')),
        CONSTRAINT ck_lugar_hora_apertura CHECK (hora_apertura BETWEEN 0 AND 23),
        CONSTRAINT ck_lugar_hora_cierre CHECK (hora_cierre BETWEEN 1 AND 24)
      );
      CREATE INDEX ix_lugar_categoria ON lugar (categoria);
      CREATE INDEX ix_lugar_saturacion ON lugar (saturacion_actual);
      CREATE INDEX ix_lugar_coordenadas ON lugar (latitud, longitud);
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query('DROP TABLE lugar;');
  },
};
