'use strict';

/** Migration 01: usuario (design section 3). Frozen after merge: new columns go in a new migration. */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      CREATE TABLE usuario (
        id            SERIAL       NOT NULL,
        nombre        VARCHAR(80)  NOT NULL,
        apellido      VARCHAR(80)  NOT NULL,
        email         VARCHAR(120) NOT NULL,
        password_hash VARCHAR(100),
        telefono      VARCHAR(20),
        distrito      VARCHAR(60),
        rol           VARCHAR(10)  NOT NULL DEFAULT 'USUARIO',
        status        VARCHAR(12)  NOT NULL DEFAULT 'ACTIVO',
        puntos_karma  INTEGER      NOT NULL DEFAULT 0,
        created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
        updated_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
        CONSTRAINT pk_usuario PRIMARY KEY (id),
        CONSTRAINT uq_usuario_email UNIQUE (email),
        CONSTRAINT ck_usuario_email_minusculas CHECK (email = lower(email)),
        CONSTRAINT ck_usuario_rol CHECK (rol IN ('USUARIO', 'ADMIN')),
        CONSTRAINT ck_usuario_status CHECK (status IN ('ACTIVO', 'SUSPENDIDO')),
        CONSTRAINT ck_usuario_puntos_karma CHECK (puntos_karma >= 0)
      );
      CREATE INDEX ix_usuario_status ON usuario (status);
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query('DROP TABLE usuario;');
  },
};
