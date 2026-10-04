'use strict';

const { DOMINIO_EMAIL, USUARIOS, generarReportes, habilitado, hoyEnLima } = require('../lib/historial-sintetico.cjs');

const PATRON_EMAIL = `%${DOMINIO_EMAIL}`;
/** Rows per INSERT, to keep each statement far below PostgreSQL parameter limits. */
const LOTE = 1000;

/**
 * Demo data: three synthetic users and about four weeks of crowd reports in every place, so the analytics
 * screens have a history to show. THE DATA IS SYNTHETIC: the users carry the email domain @sintetico.crowdradar.local
 * (that is how the analytics endpoints flag `sintetico: true`) and cannot log in (no password).
 *
 * Runs unless SEED_SINTETICO=false; when it is not set, it runs outside production only (see lib/historial-sintetico.cjs).
 * Idempotent: users are upserted by email and a report is only inserted when its (user, place, instant) is not stored yet.
 * `down` removes the synthetic users and their reports and nothing else.
 */
module.exports = {
  async up(queryInterface) {
    if (!habilitado(process.env)) {
      console.log('Historial sintético omitido (SEED_SINTETICO=false o NODE_ENV=production).');
      return;
    }
    const { sequelize } = queryInterface;
    for (const usuario of USUARIOS) {
      await sequelize.query(
        'INSERT INTO usuario (nombre, apellido, email) VALUES (:nombre, :apellido, :email) ON CONFLICT (email) DO NOTHING',
        { replacements: usuario },
      );
    }
    const [usuarios] = await sequelize.query('SELECT id, email FROM usuario WHERE email LIKE :patron ORDER BY email', {
      replacements: { patron: PATRON_EMAIL },
    });
    const [lugares] = await sequelize.query('SELECT id, categoria FROM lugar ORDER BY id');
    const usuarioIds = usuarios.map((u) => u.id);
    const [existentes] = await sequelize.query(
      'SELECT usuario_id, lugar_id, fecha_hora FROM reporte_saturacion WHERE usuario_id IN (:usuarioIds)',
      { replacements: { usuarioIds } },
    );
    const yaGuardados = new Set(existentes.map((f) => `${f.usuario_id}|${f.lugar_id}|${new Date(f.fecha_hora).getTime()}`));
    const nuevos = generarReportes({ lugares, usuarioIds, hoy: hoyEnLima() }).filter(
      (f) => !yaGuardados.has(`${f.usuario_id}|${f.lugar_id}|${f.fecha_hora.getTime()}`),
    );
    for (let i = 0; i < nuevos.length; i += LOTE) {
      await queryInterface.bulkInsert('reporte_saturacion', nuevos.slice(i, i + LOTE));
    }
    console.log(
      `Historial sintético: ${nuevos.length} reportes nuevos de ${USUARIOS.length} usuarios ${DOMINIO_EMAIL} en ${lugares.length} lugares. ` +
        'Son datos de demostración, no de personas reales.',
    );
  },

  async down(queryInterface) {
    const { sequelize } = queryInterface;
    const replacements = { patron: PATRON_EMAIL };
    await sequelize.query('DELETE FROM reporte_saturacion WHERE usuario_id IN (SELECT id FROM usuario WHERE email LIKE :patron)', {
      replacements,
    });
    await sequelize.query('DELETE FROM usuario WHERE email LIKE :patron', { replacements });
  },
};
