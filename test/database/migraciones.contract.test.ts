/**
 * Migration contract against a real PostgreSQL (opt-in: needs DATABASE_URL_TEST).
 * Each run creates a throwaway database, so it never touches the configured one.
 * Spec: R-A9.1, R-A9.2, R-A9.3. Design section 3.
 */
import { DOMINIO_EMAIL_SINTETICO } from '../../src/util/sintetico.js';
import bcrypt from 'bcrypt';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  URL_BD_TEST,
  codigoDeError,
  consultar,
  crearBdTemporal,
  ejecutarCli,
  type BaseTemporal,
} from '../support/baseDatos.js';

const UNIQUE = '23505';
const CHECK = '23514';
const FK = '23503';
const RESTRICT_CODES = ['23503', '23001'];
const NOT_NULL = '23502';
const TOO_LONG = '22001';

const TABLAS_APP = [
  'alerta',
  'denuncia',
  'dispositivo_push',
  'lugar',
  'lugar_favorito',
  'reporte_saturacion',
  'sancion_usuario',
  'token_recuperacion',
  'usuario',
  'validacion_reporte',
];
const TODAS = ['SequelizeMeta', ...TABLAS_APP].sort();

const INDICES = [
  'ix_usuario_status',
  'ix_lugar_categoria',
  'ix_lugar_saturacion',
  'ix_lugar_coordenadas',
  'ix_reporte_lugar_fecha',
  'ix_reporte_usuario_lugar_fecha',
  'ix_reporte_usuario_fecha',
  'ix_validacion_usuario',
  'ix_denuncia_estado_reporte',
  'ix_sancion_usuario_fin',
  'ix_favorito_lugar_alertas',
  'ix_alerta_usuario_leida_fecha',
  'ix_usuario_sintetico',
  'uq_usuario_email',
  'uq_lugar_osm',
  'uq_validacion_reporte_usuario',
  'uq_denuncia_reporte_usuario',
  'uq_favorito_usuario_lugar',
  'uq_token_recuperacion_hash',
  'uq_dispositivo_push_token',
];

const REGLAS_FK: Record<string, string> = {
  fk_reporte_usuario: 'RESTRICT',
  fk_reporte_lugar: 'RESTRICT',
  fk_validacion_reporte: 'CASCADE',
  fk_validacion_usuario: 'CASCADE',
  fk_denuncia_reporte: 'CASCADE',
  fk_denuncia_usuario: 'CASCADE',
  fk_denuncia_resuelta_por: 'SET NULL',
  fk_sancion_usuario: 'CASCADE',
  fk_sancion_administrador: 'RESTRICT',
  fk_sancion_levantada_por: 'SET NULL',
  fk_favorito_usuario: 'CASCADE',
  fk_favorito_lugar: 'CASCADE',
  fk_alerta_favorito: 'CASCADE',
  fk_alerta_usuario: 'CASCADE',
  fk_alerta_lugar: 'CASCADE',
  fk_token_usuario: 'CASCADE',
  fk_dispositivo_usuario: 'CASCADE',
};

describe.skipIf(!URL_BD_TEST)('migraciones (PostgreSQL real)', () => {
  let bd: BaseTemporal;
  const q = <T extends Record<string, unknown> = Record<string, unknown>>(sql: string, parametros: unknown[] = []) =>
    consultar<T>(bd.url, sql, parametros);
  const codigo = (sql: string, parametros: unknown[] = []) => codigoDeError(bd.url, sql, parametros);
  const idDe = async (sql: string, parametros: unknown[] = []) => {
    const [fila] = await q<{ id: number }>(`${sql} RETURNING id`, parametros);
    return fila?.id as number;
  };
  const tablas = async () =>
    (await q<{ tablename: string }>("SELECT tablename FROM pg_tables WHERE schemaname = 'public'"))
      .map((fila) => fila.tablename)
      .sort();

  beforeAll(async () => {
    bd = await crearBdTemporal(URL_BD_TEST as string);
  });

  afterAll(async () => {
    await bd?.eliminar();
  });

  describe('up / idempotencia', () => {
    it('db:migrate sale con 0 y crea las 10 tablas mas SequelizeMeta', async () => {
      const resultado = await ejecutarCli(['db:migrate'], bd.url);
      expect(resultado.codigo, resultado.salida).toBe(0);
      expect(await tablas()).toEqual(TODAS);
      expect(TABLAS_APP).toHaveLength(10);
    });

    it('volver a ejecutar db:migrate no cambia nada (no-op)', async () => {
      const resultado = await ejecutarCli(['db:migrate'], bd.url);
      expect(resultado.codigo, resultado.salida).toBe(0);
      expect(resultado.salida).toContain('No migrations were executed');
      expect(await tablas()).toEqual(TODAS);
    });

    it('SequelizeMeta registra las 13 migraciones en orden', async () => {
      const filas = await q<{ name: string }>('SELECT name FROM "SequelizeMeta" ORDER BY name');
      expect(filas.map((f) => f.name)).toEqual([
        '20261005000001-crear-usuario.cjs',
        '20261005000002-crear-lugar.cjs',
        '20261005000003-crear-reporte-saturacion.cjs',
        '20261005000004-crear-validacion-reporte.cjs',
        '20261005000005-crear-denuncia.cjs',
        '20261005000006-crear-sancion-usuario.cjs',
        '20261005000007-crear-lugar-favorito.cjs',
        '20261005000008-crear-alerta.cjs',
        '20261005000009-crear-token-recuperacion.cjs',
        '20261005000010-crear-dispositivo-push.cjs',
        '20261005000012-usuario-password-cambiada-en.cjs',
        '20261005000013-lugar-osm-tipo.cjs',
        '20261018000014-usuario-indice-sintetico.cjs',
      ]);
    });
  });

  describe('estructura', () => {
    it('toda tabla tiene id entero y created_at/updated_at TIMESTAMPTZ NOT NULL', async () => {
      expect(TABLAS_APP.length).toBeGreaterThan(0);
      for (const tabla of TABLAS_APP) {
        const columnas = await q<{ column_name: string; data_type: string; is_nullable: string }>(
          'SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name = $1',
          [tabla],
        );
        const porNombre = Object.fromEntries(columnas.map((c) => [c.column_name, c]));
        expect(porNombre.id?.data_type, `${tabla}.id`).toBe('integer');
        for (const marca of ['created_at', 'updated_at']) {
          expect(porNombre[marca]?.data_type, `${tabla}.${marca}`).toBe('timestamp with time zone');
          expect(porNombre[marca]?.is_nullable, `${tabla}.${marca}`).toBe('NO');
        }
      }
    });

    it('existen los indices y restricciones unicas con los nombres del diseno', async () => {
      const filas = await q<{ indexname: string }>("SELECT indexname FROM pg_indexes WHERE schemaname = 'public'");
      const existentes = new Set(filas.map((f) => f.indexname));
      expect(INDICES.length).toBeGreaterThan(0);
      for (const indice of INDICES) expect(existentes.has(indice), indice).toBe(true);
    });

    it('ix_usuario_sintetico es parcial con el mismo LIKE que usa la analitica (si no, el planificador no lo usa)', async () => {
      const [fila] = await q<{ indexdef: string }>("SELECT indexdef FROM pg_indexes WHERE indexname = 'ix_usuario_sintetico'");
      expect(fila?.indexdef).toContain(`WHERE ((email)::text ~~ '%${DOMINIO_EMAIL_SINTETICO}'::text)`);
    });

    it('las claves foraneas usan el ON DELETE del diseno', async () => {
      const filas = await q<{ constraint_name: string; delete_rule: string }>(
        'SELECT constraint_name, delete_rule FROM information_schema.referential_constraints',
      );
      const reglas = Object.fromEntries(filas.map((f) => [f.constraint_name, f.delete_rule]));
      expect(reglas).toEqual(REGLAS_FK);
    });
  });

  describe('usuario', () => {
    it('tiene las columnas, tipos y valores por defecto del diseno', async () => {
      const columnas = await q<{ column_name: string; data_type: string; is_nullable: string }>(
        "SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name = 'usuario' ORDER BY ordinal_position",
      );
      expect(columnas.map((c) => c.column_name)).toEqual([
        'id',
        'nombre',
        'apellido',
        'email',
        'password_hash',
        'telefono',
        'distrito',
        'rol',
        'status',
        'puntos_karma',
        'created_at',
        'updated_at',
        'password_cambiada_en',
      ]);
      const porNombre = Object.fromEntries(columnas.map((c) => [c.column_name, c]));
      expect(porNombre.puntos_karma?.data_type).toBe('integer');
      expect(porNombre.nombre?.is_nullable).toBe('NO');
      expect(porNombre.telefono?.is_nullable).toBe('YES');

      await q("INSERT INTO usuario (nombre, apellido, email) VALUES ('Ana', 'Perez', 'defecto@crowdradar.pe')");
      const [fila] = await q("SELECT rol, status, puntos_karma, created_at, updated_at FROM usuario WHERE email = 'defecto@crowdradar.pe'");
      expect(fila).toMatchObject({ rol: 'USUARIO', status: 'ACTIVO', puntos_karma: 0 });
      expect(fila?.created_at).toBeInstanceOf(Date);
      expect(fila?.updated_at).toBeInstanceOf(Date);
    });

    it('rechaza email duplicado, email con mayusculas, rol/status fuera del enum y karma negativo', async () => {
      const insertar = (email: string, rol = 'USUARIO', status = 'ACTIVO', karma = 0) =>
        codigo('INSERT INTO usuario (nombre, apellido, email, rol, status, puntos_karma) VALUES ($1, $2, $3, $4, $5, $6)', [
          'N',
          'A',
          email,
          rol,
          status,
          karma,
        ]);

      expect(await insertar('defecto@crowdradar.pe')).toBe(UNIQUE);
      expect(await insertar('Mayus@crowdradar.pe')).toBe(CHECK);
      expect(await insertar('rol@crowdradar.pe', 'SUPERADMIN')).toBe(CHECK);
      expect(await insertar('status@crowdradar.pe', 'USUARIO', 'BORRADO')).toBe(CHECK);
      expect(await insertar('karma@crowdradar.pe', 'USUARIO', 'ACTIVO', -1)).toBe(CHECK);
      expect(await insertar('valido@crowdradar.pe', 'ADMIN', 'SUSPENDIDO', 5)).toBeUndefined();
    });
  });

  describe('restricciones por tabla', () => {
    let u1 = 0;
    let u2 = 0;
    let u3 = 0;
    let lugar1 = 0;
    let lugar2 = 0;
    let reporte1 = 0;

    const nuevoUsuario = (email: string) =>
      idDe("INSERT INTO usuario (nombre, apellido, email) VALUES ('Nombre', 'Apellido', $1)", [email]);
    const nuevoLugar = (osmId: number) =>
      idDe(
        "INSERT INTO lugar (osm_id, nombre, latitud, longitud, categoria) VALUES ($1, 'Lugar de prueba', -12.1, -77.0, 'PARQUE')",
        [osmId],
      );
    const nuevoReporte = (usuario: number, lugar: number) =>
      idDe("INSERT INTO reporte_saturacion (usuario_id, lugar_id, nivel_saturacion) VALUES ($1, $2, 'MODERADO')", [usuario, lugar]);

    beforeAll(async () => {
      u1 = await nuevoUsuario('fixture1@crowdradar.pe');
      u2 = await nuevoUsuario('fixture2@crowdradar.pe');
      u3 = await nuevoUsuario('fixture3@crowdradar.pe');
      lugar1 = await nuevoLugar(900001);
      lugar2 = await nuevoLugar(900002);
      reporte1 = await nuevoReporte(u1, lugar1);
    });

    it('lugar: categoria, rangos de coordenadas, saturacion y horas validados; osm_id unico', async () => {
      const insertar = (campos: Record<string, unknown>) => {
        const base = { osm_id: 910000 + Math.floor(Math.random() * 80000), nombre: 'L', latitud: -12.1, longitud: -77.0, categoria: 'PLAZA', ...campos };
        const columnas = Object.keys(base);
        return codigo(
          `INSERT INTO lugar (${columnas.join(', ')}) VALUES (${columnas.map((_, i) => `$${i + 1}`).join(', ')})`,
          Object.values(base),
        );
      };
      expect(await insertar({ categoria: 'ESTADIO' })).toBe(CHECK);
      expect(await insertar({ latitud: 95 })).toBe(CHECK);
      expect(await insertar({ longitud: -181 })).toBe(CHECK);
      expect(await insertar({ saturacion_actual: 'LLENO' })).toBe(CHECK);
      expect(await insertar({ hora_apertura: 24 })).toBe(CHECK);
      expect(await insertar({ hora_cierre: 0 })).toBe(CHECK);
      expect(await insertar({ hora_cierre: 25 })).toBe(CHECK);
      expect(await insertar({ nombre: null })).toBe(NOT_NULL);
      expect(await insertar({ osm_id: 900001 })).toBe(UNIQUE);
      // valid: crosses midnight (22 -> 2), saturation set
      expect(await insertar({ hora_apertura: 22, hora_cierre: 2, saturacion_actual: 'SATURADO' })).toBeUndefined();
      const [fila] = await q('SELECT latitud, saturacion_actual FROM lugar WHERE id = $1', [lugar1]);
      expect(fila).toMatchObject({ latitud: '-12.100000', saturacion_actual: null });
    });

    it('reporte_saturacion: enums, FKs RESTRICT y valores por defecto', async () => {
      const insertar = (campos: Record<string, unknown>) => {
        const base = { usuario_id: u1, lugar_id: lugar1, nivel_saturacion: 'TRANQUILO', ...campos };
        const columnas = Object.keys(base);
        return codigo(
          `INSERT INTO reporte_saturacion (${columnas.join(', ')}) VALUES (${columnas.map((_, i) => `$${i + 1}`).join(', ')})`,
          Object.values(base),
        );
      };
      expect(await insertar({ nivel_saturacion: 'LLENO' })).toBe(CHECK);
      expect(await insertar({ estado: 'BORRADO' })).toBe(CHECK);
      expect(await insertar({ motivo_sin_puntos: 'OTRO' })).toBe(CHECK);
      expect(await insertar({ nivel_confiabilidad: 100.01 })).toBe(CHECK);
      expect(await insertar({ usuario_id: 999999 })).toBe(FK);
      expect(await insertar({ lugar_id: 999999 })).toBe(FK);
      expect(await insertar({ motivo_sin_puntos: 'TOPE_DIARIO', nivel_confiabilidad: 85.5 })).toBeUndefined();

      const [fila] = await q('SELECT estado, puntos_otorgados, fecha_hora, nivel_confiabilidad FROM reporte_saturacion WHERE id = $1', [reporte1]);
      expect(fila).toMatchObject({ estado: 'ACTIVO', puntos_otorgados: 0, nivel_confiabilidad: null });
      expect(fila?.fecha_hora).toBeInstanceOf(Date);

      // ON DELETE RESTRICT reports 23503 on Postgres <= 16 (CI) and 23001 on Postgres 18.
      expect(RESTRICT_CODES).toContain(await codigo('DELETE FROM usuario WHERE id = $1', [u1]));
      expect(RESTRICT_CODES).toContain(await codigo('DELETE FROM lugar WHERE id = $1', [lugar1]));
    });

    it('validacion_reporte: una validacion por usuario y reporte, tipo valido, karma obligatorio, cascade', async () => {
      const insertar = (reporte: number, usuario: number, extra: Record<string, unknown> = {}) => {
        const base = { reporte_id: reporte, usuario_id: usuario, tipo_accion: 'CONFIRMAR', karma_votante: 10, ...extra };
        const columnas = Object.keys(base);
        return codigo(
          `INSERT INTO validacion_reporte (${columnas.join(', ')}) VALUES (${columnas.map((_, i) => `$${i + 1}`).join(', ')})`,
          Object.values(base),
        );
      };
      expect(await insertar(reporte1, u2, { tipo_accion: 'TALVEZ' })).toBe(CHECK);
      expect(await insertar(reporte1, u2, { karma_votante: null })).toBe(NOT_NULL);
      expect(await insertar(reporte1, u2, { karma_votante: -1 })).toBe(CHECK);
      expect(await insertar(reporte1, u2)).toBeUndefined();
      expect(await insertar(reporte1, u2, { tipo_accion: 'RECHAZAR' })).toBe(UNIQUE);

      const reporteTemporal = await nuevoReporte(u2, lugar2);
      expect(await insertar(reporteTemporal, u3)).toBeUndefined();
      await q('DELETE FROM reporte_saturacion WHERE id = $1', [reporteTemporal]);
      expect(await q('SELECT 1 FROM validacion_reporte WHERE reporte_id = $1', [reporteTemporal])).toHaveLength(0);
    });

    it('denuncia: motivo valido, detalle obligatorio con OTRO, unica por usuario y reporte, defaults', async () => {
      const insertar = (usuario: number, extra: Record<string, unknown> = {}) => {
        const base = { reporte_id: reporte1, usuario_id: usuario, motivo: 'SPAM', ...extra };
        const columnas = Object.keys(base);
        return codigo(
          `INSERT INTO denuncia (${columnas.join(', ')}) VALUES (${columnas.map((_, i) => `$${i + 1}`).join(', ')})`,
          Object.values(base),
        );
      };
      expect(await insertar(u2, { motivo: 'ACOSO' })).toBe(CHECK);
      expect(await insertar(u2, { motivo: 'OTRO' })).toBe(CHECK);
      expect(await insertar(u2, { motivo: 'OTRO', detalle: '   ' })).toBe(CHECK);
      expect(await insertar(u2, { estado: 'ARCHIVADA' })).toBe(CHECK);
      expect(await insertar(u2, { detalle: 'x'.repeat(281) })).toBe(TOO_LONG);
      expect(await insertar(u2, { motivo: 'OTRO', detalle: 'Informacion engañosa' })).toBeUndefined();
      expect(await insertar(u2)).toBe(UNIQUE);
      expect(await insertar(u3)).toBeUndefined();

      const [fila] = await q('SELECT estado, resuelta_por, resuelta_en FROM denuncia WHERE usuario_id = $1', [u3]);
      expect(fila).toMatchObject({ estado: 'PENDIENTE', resuelta_por: null, resuelta_en: null });
    });

    it('sancion_usuario: dias 3/7/30, fecha_fin posterior al inicio, tipo valido, cascade por usuario', async () => {
      const insertar = (usuario: number, extra: Record<string, unknown> = {}) => {
        const base = {
          usuario_id: usuario,
          administrador_id: u1,
          dias: 7,
          motivo: 'Reportes falsos reiterados',
          fecha_inicio: '2026-10-05T00:00:00Z',
          fecha_fin: '2026-10-12T00:00:00Z',
          ...extra,
        };
        const columnas = Object.keys(base);
        return codigo(
          `INSERT INTO sancion_usuario (${columnas.join(', ')}) VALUES (${columnas.map((_, i) => `$${i + 1}`).join(', ')})`,
          Object.values(base),
        );
      };
      expect(await insertar(u2, { dias: 5 })).toBe(CHECK);
      expect(await insertar(u2, { tipo: 'EXPULSION' })).toBe(CHECK);
      expect(await insertar(u2, { fecha_fin: '2026-10-05T00:00:00Z' })).toBe(CHECK);
      expect(await insertar(u2, { fecha_fin: '2026-10-04T00:00:00Z' })).toBe(CHECK);
      expect(await insertar(u2, { motivo: null })).toBe(NOT_NULL);
      expect(await insertar(u2, { administrador_id: 999999 })).toBe(FK);
      expect(await insertar(u3)).toBeUndefined();

      const [fila] = await q('SELECT tipo, fecha_levantamiento, levantada_por FROM sancion_usuario WHERE usuario_id = $1', [u3]);
      expect(fila).toMatchObject({ tipo: 'SUSPENSION_TEMPORAL', fecha_levantamiento: null, levantada_por: null });
    });

    it('lugar_favorito y alerta: unicidad, enums, defaults y cascade desde el lugar', async () => {
      const favorito = await idDe('INSERT INTO lugar_favorito (usuario_id, lugar_id) VALUES ($1, $2)', [u2, lugar2]);
      const [fav] = await q('SELECT alertas_activadas FROM lugar_favorito WHERE id = $1', [favorito]);
      expect(fav).toMatchObject({ alertas_activadas: true });
      expect(await codigo('INSERT INTO lugar_favorito (usuario_id, lugar_id) VALUES ($1, $2)', [u2, lugar2])).toBe(UNIQUE);

      const insertarAlerta = (extra: Record<string, unknown> = {}) => {
        const base = { favorito_id: favorito, usuario_id: u2, lugar_id: lugar2, nivel_nuevo: 'SATURADO', mensaje: 'Esta saturado', ...extra };
        const columnas = Object.keys(base);
        return codigo(
          `INSERT INTO alerta (${columnas.join(', ')}) VALUES (${columnas.map((_, i) => `$${i + 1}`).join(', ')})`,
          Object.values(base),
        );
      };
      expect(await insertarAlerta({ nivel_nuevo: 'LLENO' })).toBe(CHECK);
      expect(await insertarAlerta({ nivel_anterior: 'LLENO' })).toBe(CHECK);
      expect(await insertarAlerta({ mensaje: null })).toBe(NOT_NULL);
      expect(await insertarAlerta({ mensaje: 'm'.repeat(201) })).toBe(TOO_LONG);
      expect(await insertarAlerta({ nivel_anterior: null })).toBeUndefined();
      const [alerta] = await q('SELECT leida, fecha_hora FROM alerta WHERE favorito_id = $1', [favorito]);
      expect(alerta).toMatchObject({ leida: false });
      expect(alerta?.fecha_hora).toBeInstanceOf(Date);

      await q('DELETE FROM lugar WHERE id = $1', [lugar2]);
      expect(await q('SELECT 1 FROM lugar_favorito WHERE id = $1', [favorito])).toHaveLength(0);
      expect(await q('SELECT 1 FROM alerta WHERE favorito_id = $1', [favorito])).toHaveLength(0);
    });

    it('token_recuperacion y dispositivo_push: hash/token unicos, CHAR(64), plataforma valida, cascade', async () => {
      const hash = 'a'.repeat(64);
      const insertarToken = (extra: Record<string, unknown> = {}) => {
        const base = { usuario_id: u3, token_hash: hash, expira_en: '2026-10-05T01:00:00Z', ...extra };
        const columnas = Object.keys(base);
        return codigo(
          `INSERT INTO token_recuperacion (${columnas.join(', ')}) VALUES (${columnas.map((_, i) => `$${i + 1}`).join(', ')})`,
          Object.values(base),
        );
      };
      expect(await insertarToken({ token_hash: 'a'.repeat(65) })).toBe(TOO_LONG);
      expect(await insertarToken({ expira_en: null })).toBe(NOT_NULL);
      expect(await insertarToken()).toBeUndefined();
      expect(await insertarToken()).toBe(UNIQUE);

      const insertarDispositivo = (extra: Record<string, unknown> = {}) => {
        const base = { usuario_id: u3, token_fcm: 'fcm-token-1', plataforma: 'ANDROID', ...extra };
        const columnas = Object.keys(base);
        return codigo(
          `INSERT INTO dispositivo_push (${columnas.join(', ')}) VALUES (${columnas.map((_, i) => `$${i + 1}`).join(', ')})`,
          Object.values(base),
        );
      };
      expect(await insertarDispositivo({ plataforma: 'WEB' })).toBe(CHECK);
      expect(await insertarDispositivo({ token_fcm: 'f'.repeat(256) })).toBe(TOO_LONG);
      expect(await insertarDispositivo()).toBeUndefined();
      expect(await insertarDispositivo({ plataforma: 'IOS' })).toBe(UNIQUE);

      await q('DELETE FROM usuario WHERE id = $1', [u3]);
      expect(await q('SELECT 1 FROM token_recuperacion WHERE usuario_id = $1', [u3])).toHaveLength(0);
      expect(await q('SELECT 1 FROM dispositivo_push WHERE usuario_id = $1', [u3])).toHaveLength(0);
      expect(await q('SELECT 1 FROM sancion_usuario WHERE usuario_id = $1', [u3])).toHaveLength(0);
      expect(await q('SELECT 1 FROM denuncia WHERE usuario_id = $1', [u3])).toHaveLength(0);
    });
  });

  describe('down y up/down/up', () => {
    it('db:migrate:undo:all elimina todas las tablas de aplicacion y termina con 0', async () => {
      const deshacer = await ejecutarCli(['db:migrate:undo:all'], bd.url);
      expect(deshacer.codigo, deshacer.salida).toBe(0);
      expect(await tablas()).toEqual(['SequelizeMeta']);
    });

    it('migrar de nuevo funciona (up/down/up)', async () => {
      const rehacer = await ejecutarCli(['db:migrate'], bd.url);
      expect(rehacer.codigo, rehacer.salida).toBe(0);
      expect(await tablas()).toEqual(TODAS);
    });

    const columnaPasswordCambiadaEn = () =>
      q<{ data_type: string; is_nullable: string }>(
        "SELECT data_type, is_nullable FROM information_schema.columns WHERE table_name = 'usuario' AND column_name = 'password_cambiada_en'",
      );

    it('usuario.password_cambiada_en es TIMESTAMPTZ nullable (R1-402)', async () => {
      expect(await columnaPasswordCambiadaEn()).toEqual([{ data_type: 'timestamp with time zone', is_nullable: 'YES' }]);
    });

    const columnaOsmTipo = () =>
      q("SELECT 1 FROM information_schema.columns WHERE table_name = 'lugar' AND column_name = 'osm_tipo'");

    const indiceSintetico = () => q("SELECT 1 FROM pg_indexes WHERE indexname = 'ix_usuario_sintetico'");

    it('db:migrate:undo deshace solo la ultima migracion (ix_usuario_sintetico) y la rehace', async () => {
      const deshacer = await ejecutarCli(['db:migrate:undo'], bd.url);
      expect(deshacer.codigo, deshacer.salida).toBe(0);
      expect(await tablas()).toEqual(TODAS);
      expect(await indiceSintetico()).toEqual([]);
      expect(await columnaOsmTipo()).toHaveLength(1);
      const rehacer = await ejecutarCli(['db:migrate'], bd.url);
      expect(rehacer.codigo, rehacer.salida).toBe(0);
      expect(await indiceSintetico()).toHaveLength(1);
    });

    it('un segundo db:migrate:undo deshace lugar.osm_tipo y la rehace', async () => {
      await ejecutarCli(['db:migrate:undo'], bd.url);
      const deshacer = await ejecutarCli(['db:migrate:undo'], bd.url);
      expect(deshacer.codigo, deshacer.salida).toBe(0);
      expect(await tablas()).toEqual(TODAS);
      expect(await columnaOsmTipo()).toEqual([]);
      expect(await columnaPasswordCambiadaEn()).toHaveLength(1);
      const rehacer = await ejecutarCli(['db:migrate'], bd.url);
      expect(rehacer.codigo, rehacer.salida).toBe(0);
      expect(await columnaOsmTipo()).toHaveLength(1);
    });

    it('un tercer db:migrate:undo deshace password_cambiada_en y la rehace', async () => {
      await ejecutarCli(['db:migrate:undo'], bd.url);
      await ejecutarCli(['db:migrate:undo'], bd.url);
      const deshacer = await ejecutarCli(['db:migrate:undo'], bd.url);
      expect(deshacer.codigo, deshacer.salida).toBe(0);
      expect(await columnaPasswordCambiadaEn()).toEqual([]);
      const rehacer = await ejecutarCli(['db:migrate'], bd.url);
      expect(rehacer.codigo, rehacer.salida).toBe(0);
      expect(await columnaPasswordCambiadaEn()).toHaveLength(1);
      expect(await columnaOsmTipo()).toHaveLength(1);
    });

    it('un cuarto db:migrate:undo deshace dispositivo_push y la rehace', async () => {
      await ejecutarCli(['db:migrate:undo'], bd.url);
      await ejecutarCli(['db:migrate:undo'], bd.url);
      await ejecutarCli(['db:migrate:undo'], bd.url);
      const deshacer = await ejecutarCli(['db:migrate:undo'], bd.url);
      expect(deshacer.codigo, deshacer.salida).toBe(0);
      expect(await tablas()).toEqual(TODAS.filter((t) => t !== 'dispositivo_push'));
      const rehacer = await ejecutarCli(['db:migrate'], bd.url);
      expect(rehacer.codigo, rehacer.salida).toBe(0);
      expect(await tablas()).toEqual(TODAS);
    });
  });

  describe('seeders', () => {
    const admin = { ADMIN_EMAIL: 'admin@crowdradar.test', ADMIN_PASSWORD: 'ClaveAdmin123', BCRYPT_COSTO: '4' };
    const categorias = ['PARQUE', 'CENTRO_COMERCIAL', 'MERCADO', 'TRANSPORTE', 'PLAZA', 'PLAYA'];

    it('sin ADMIN_EMAIL/ADMIN_PASSWORD falla con un mensaje claro y no inserta nada', async () => {
      const resultado = await ejecutarCli(['db:seed:all'], bd.url, { ADMIN_EMAIL: '', ADMIN_PASSWORD: '' });
      expect(resultado.codigo).not.toBe(0);
      expect(resultado.salida).toContain('ADMIN_EMAIL');
      expect(await q("SELECT 1 FROM usuario WHERE email = 'admin@crowdradar.test'")).toHaveLength(0);
    });

    it('inserta un ADMIN activo con hash bcrypt verificable', async () => {
      const resultado = await ejecutarCli(['db:seed:all'], bd.url, admin);
      expect(resultado.codigo, resultado.salida).toBe(0);
      const filas = await q<{ rol: string; status: string; password_hash: string }>(
        'SELECT rol, status, password_hash FROM usuario WHERE email = $1',
        [admin.ADMIN_EMAIL],
      );
      expect(filas).toHaveLength(1);
      expect(filas[0]).toMatchObject({ rol: 'ADMIN', status: 'ACTIVO' });
      expect(filas[0]?.password_hash).not.toContain(admin.ADMIN_PASSWORD);
      expect(await bcrypt.compare(admin.ADMIN_PASSWORD, filas[0]?.password_hash as string)).toBe(true);
    });

    it('inserta lugares de Lima: al menos uno por categoria, osm_id presente y saturacion NULL', async () => {
      const filas = await q<{ categoria: string; osm_id: string; saturacion_actual: string | null; nombre: string }>(
        'SELECT categoria, osm_id, saturacion_actual, nombre FROM lugar',
      );
      expect(filas.length).toBeGreaterThanOrEqual(categorias.length);
      for (const categoria of categorias) {
        expect(filas.some((f) => f.categoria === categoria), categoria).toBe(true);
      }
      for (const fila of filas) {
        expect(fila.osm_id).not.toBeNull();
        expect(fila.saturacion_actual).toBeNull();
        expect(fila.nombre.length).toBeGreaterThan(0);
      }
    });

    it('es idempotente: ejecutar los seeders de nuevo no duplica admin ni lugares ni cambia el hash', async () => {
      const [antes] = await q<{ password_hash: string }>('SELECT password_hash FROM usuario WHERE email = $1', [admin.ADMIN_EMAIL]);
      const [{ total: lugaresAntes } = { total: '0' }] = await q<{ total: string }>('SELECT count(*) AS total FROM lugar');

      const resultado = await ejecutarCli(['db:seed:all'], bd.url, { ...admin, ADMIN_PASSWORD: 'OtraClave123' });
      expect(resultado.codigo, resultado.salida).toBe(0);

      const admins = await q<{ password_hash: string }>('SELECT password_hash FROM usuario WHERE email = $1', [admin.ADMIN_EMAIL]);
      expect(admins).toHaveLength(1);
      expect(admins[0]?.password_hash).toBe(antes?.password_hash);
      const [{ total: lugaresDespues } = { total: '-1' }] = await q<{ total: string }>('SELECT count(*) AS total FROM lugar');
      expect(lugaresDespues).toBe(lugaresAntes);
    });

    it('volver a sembrar restaura datos de un lugar modificado sin tocar su saturacion', async () => {
      await q("UPDATE lugar SET nombre = 'Nombre alterado', saturacion_actual = 'SATURADO' WHERE categoria = 'PLAYA'");
      const resultado = await ejecutarCli(['db:seed:all'], bd.url, admin);
      expect(resultado.codigo, resultado.salida).toBe(0);
      const [fila] = await q<{ nombre: string; saturacion_actual: string }>(
        "SELECT nombre, saturacion_actual FROM lugar WHERE categoria = 'PLAYA'",
      );
      expect(fila?.nombre).not.toBe('Nombre alterado');
      expect(fila?.saturacion_actual).toBe('SATURADO');
    });

    describe('historial sintetico (SEED_SINTETICO)', () => {
      const SEEDER = '20261005100003-historial-sintetico.cjs';
      const DOMINIO = '%@sintetico.crowdradar.local';
      const contar = async (sql: string, parametros: unknown[] = []) => Number((await q<{ n: string }>(sql, parametros))[0]?.n);
      const sinteticos = () => contar('SELECT count(*) AS n FROM usuario WHERE email LIKE $1', [DOMINIO]);
      const reportesSinteticos = () =>
        contar(
          'SELECT count(*) AS n FROM reporte_saturacion WHERE usuario_id IN (SELECT id FROM usuario WHERE email LIKE $1)',
          [DOMINIO],
        );
      const sembrar = (sintetico: string) => ejecutarCli(['db:seed:all'], bd.url, { ...admin, SEED_SINTETICO: sintetico });
      const deshacer = () => ejecutarCli(['db:seed:undo', '--seed', SEEDER], bd.url, admin);

      it('con SEED_SINTETICO=false no crea usuarios ni reportes sinteticos', async () => {
        expect((await deshacer()).codigo).toBe(0);
        const resultado = await sembrar('false');
        expect(resultado.codigo, resultado.salida).toBe(0);
        expect(await sinteticos()).toBe(0);
        expect(await reportesSinteticos()).toBe(0);
      });

      it('con SEED_SINTETICO=true crea 3 usuarios sin password y reportes ACTIVO pasados en los 45 lugares', async () => {
        const resultado = await sembrar('true');
        expect(resultado.codigo, resultado.salida).toBe(0);
        expect(resultado.salida).toMatch(/sint[eé]tic/i);
        expect(await sinteticos()).toBe(3);
        expect(await contar('SELECT count(*) AS n FROM usuario WHERE email LIKE $1 AND password_hash IS NOT NULL', [DOMINIO])).toBe(0);
        expect(await reportesSinteticos()).toBeGreaterThan(5000);
        const lugares = await contar('SELECT count(*) AS n FROM lugar');
        expect(
          await contar(
            `SELECT count(DISTINCT lugar_id) AS n FROM reporte_saturacion
              WHERE usuario_id IN (SELECT id FROM usuario WHERE email LIKE $1)`,
            [DOMINIO],
          ),
        ).toBe(lugares);
        expect(await contar("SELECT count(*) AS n FROM reporte_saturacion WHERE fecha_hora > now() OR estado <> 'ACTIVO'")).toBe(0);
      });

      it('es idempotente: sembrar otra vez no agrega usuarios ni reportes', async () => {
        const usuariosAntes = await sinteticos();
        const reportesAntes = await reportesSinteticos();
        const resultado = await sembrar('true');
        expect(resultado.codigo, resultado.salida).toBe(0);
        expect(await sinteticos()).toBe(usuariosAntes);
        expect(await reportesSinteticos()).toBe(reportesAntes);
      });

      it('db:seed:undo funciona aunque los usuarios sinteticos tengan favoritos, alertas, dispositivos y votos, y deja lo real', async () => {
        expect((await sembrar('true')).codigo).toBe(0);
        const [demo] = await q<{ id: number }>('SELECT id FROM usuario WHERE email LIKE $1 ORDER BY id LIMIT 1', [DOMINIO]);
        const [real] = await q<{ id: number }>('SELECT id FROM usuario WHERE email = $1', [admin.ADMIN_EMAIL]);
        const [lugar] = await q<{ id: number }>('SELECT id FROM lugar ORDER BY id LIMIT 1');
        const [favorito] = await q<{ id: number }>(
          'INSERT INTO lugar_favorito (usuario_id, lugar_id) VALUES ($1, $2) RETURNING id',
          [demo?.id, lugar?.id],
        );
        await q("INSERT INTO alerta (favorito_id, usuario_id, lugar_id, nivel_nuevo, mensaje) VALUES ($1, $2, $3, 'SATURADO', 'x')", [
          favorito?.id,
          demo?.id,
          lugar?.id,
        ]);
        await q("INSERT INTO dispositivo_push (usuario_id, token_fcm, plataforma) VALUES ($1, 'tok-demo', 'ANDROID')", [demo?.id]);
        const [reporteDemo] = await q<{ id: number }>('SELECT id FROM reporte_saturacion WHERE usuario_id = $1 LIMIT 1', [demo?.id]);
        await q(
          "INSERT INTO validacion_reporte (reporte_id, usuario_id, tipo_accion, karma_votante) VALUES ($1, $2, 'CONFIRMAR', 0)",
          [reporteDemo?.id, real?.id],
        );
        await q("INSERT INTO lugar_favorito (usuario_id, lugar_id) VALUES ($1, $2)", [real?.id, lugar?.id]);
        const resultado = await deshacer();
        expect(resultado.codigo, resultado.salida).toBe(0);
        expect(await sinteticos()).toBe(0);
        expect(await contar('SELECT count(*) AS n FROM alerta')).toBe(0);
        expect(await contar("SELECT count(*) AS n FROM dispositivo_push WHERE token_fcm = 'tok-demo'")).toBe(0);
        expect(await contar('SELECT count(*) AS n FROM validacion_reporte')).toBe(0);
        expect(await contar('SELECT count(*) AS n FROM lugar_favorito WHERE usuario_id = $1', [real?.id])).toBe(1);
      });

      it('db:seed:undo del seeder borra solo lo sintetico y deja admin, lugares y reportes reales', async () => {
        const [lugar] = await q<{ id: number }>('SELECT id FROM lugar ORDER BY id LIMIT 1');
        const [real] = await q<{ id: number }>('SELECT id FROM usuario WHERE email = $1', [admin.ADMIN_EMAIL]);
        await q("INSERT INTO reporte_saturacion (usuario_id, lugar_id, nivel_saturacion) VALUES ($1, $2, 'MODERADO')", [
          real?.id,
          lugar?.id,
        ]);
        const lugaresAntes = await contar('SELECT count(*) AS n FROM lugar');
        const resultado = await deshacer();
        expect(resultado.codigo, resultado.salida).toBe(0);
        expect(await sinteticos()).toBe(0);
        expect(await reportesSinteticos()).toBe(0);
        expect(await contar('SELECT count(*) AS n FROM reporte_saturacion WHERE usuario_id = $1', [real?.id])).toBe(1);
        expect(await contar('SELECT count(*) AS n FROM lugar')).toBe(lugaresAntes);
        expect(await contar('SELECT count(*) AS n FROM usuario WHERE email = $1', [admin.ADMIN_EMAIL])).toBe(1);
      });
    });
  });
});
