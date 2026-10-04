import { QueryTypes, type Sequelize } from 'sequelize';
import type { Sembrador } from '../../../dao/Sembrador.js';
import { DOMINIO_EMAIL_SINTETICO } from '../../../../src/util/sintetico.js';

/** Sembrador for the Sequelize contract suites: inserts real rows so every foreign key holds. */
export function crearSembradorSequelize(sequelize: Sequelize): Sembrador {
  let contador = 0;
  const insertar = async (sql: string, replacements: Record<string, unknown> = {}): Promise<number> => {
    const filas = await sequelize.query<{ id: number }>(`${sql} RETURNING id`, {
      replacements,
      type: QueryTypes.SELECT,
    });
    return filas[0]!.id;
  };
  return {
    usuario: () => {
      contador += 1;
      return insertar(`INSERT INTO usuario (nombre, apellido, email) VALUES ('Test', 'Sembrado', :email)`, {
        email: `sembrado${contador}-${Date.now()}@test.local`,
      });
    },
    usuarioSintetico: () => {
      contador += 1;
      return insertar(`INSERT INTO usuario (nombre, apellido, email) VALUES ('Demo', 'Sintetico', :email)`, {
        email: `demo${contador}-${Date.now()}${DOMINIO_EMAIL_SINTETICO}`,
      });
    },
    lugar: () => {
      contador += 1;
      return insertar(
        `INSERT INTO lugar (nombre, latitud, longitud, categoria) VALUES (:nombre, -12.05, -77.04, 'PLAZA')`,
        { nombre: `Lugar sembrado ${contador}` },
      );
    },
    reporte: (usuarioId, lugarId) =>
      insertar(
        `INSERT INTO reporte_saturacion (usuario_id, lugar_id, nivel_saturacion) VALUES (:usuarioId, :lugarId, 'MODERADO')`,
        { usuarioId, lugarId },
      ),
    // Idempotent per (usuario, lugar): contracts ask for "the favourite" of a pair repeatedly (an alert per call).
    favorito: (usuarioId, lugarId) =>
      insertar(
        `INSERT INTO lugar_favorito (usuario_id, lugar_id) VALUES (:usuarioId, :lugarId)
         ON CONFLICT (usuario_id, lugar_id) DO UPDATE SET updated_at = now()`,
        { usuarioId, lugarId },
      ),
  };
}
