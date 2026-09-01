/**
 * Migration contract against a real PostgreSQL (opt-in: needs DATABASE_URL_TEST).
 * Each run creates a throwaway database, so it never touches the configured one.
 * Spec: R-A9.1, R-A9.2, R-A9.3.
 */
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

describe.skipIf(!URL_BD_TEST)('migraciones (PostgreSQL real)', () => {
  let bd: BaseTemporal;
  const tablas = async () =>
    (
      await consultar<{ tablename: string }>(
        bd.url,
        "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename",
      )
    ).map((fila) => fila.tablename);

  beforeAll(async () => {
    bd = await crearBdTemporal(URL_BD_TEST as string);
  });

  afterAll(async () => {
    await bd?.eliminar();
  });

  describe('migracion 01 usuario', () => {
    it('db:migrate sale con 0 y crea usuario y SequelizeMeta', async () => {
      const resultado = await ejecutarCli(['db:migrate'], bd.url);
      expect(resultado.codigo, resultado.salida).toBe(0);
      expect(await tablas()).toEqual(['SequelizeMeta', 'usuario']);
    });

    it('volver a ejecutar db:migrate no cambia nada (no-op)', async () => {
      const resultado = await ejecutarCli(['db:migrate'], bd.url);
      expect(resultado.codigo, resultado.salida).toBe(0);
      expect(resultado.salida).toContain('No migrations were executed');
      expect(await tablas()).toEqual(['SequelizeMeta', 'usuario']);
    });

    it('usuario tiene las columnas, tipos y valores por defecto del diseno', async () => {
      const columnas = await consultar<{ column_name: string; data_type: string; is_nullable: string }>(
        bd.url,
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
      ]);
      const porNombre = Object.fromEntries(columnas.map((c) => [c.column_name, c]));
      expect(porNombre.created_at?.data_type).toBe('timestamp with time zone');
      expect(porNombre.puntos_karma?.data_type).toBe('integer');
      expect(porNombre.nombre?.is_nullable).toBe('NO');
      expect(porNombre.telefono?.is_nullable).toBe('YES');

      await consultar(bd.url, "INSERT INTO usuario (nombre, apellido, email) VALUES ('Ana', 'Perez', 'defecto@crowdradar.pe')");
      const [fila] = await consultar(bd.url, "SELECT rol, status, puntos_karma, created_at, updated_at FROM usuario WHERE email = 'defecto@crowdradar.pe'");
      expect(fila).toMatchObject({ rol: 'USUARIO', status: 'ACTIVO', puntos_karma: 0 });
      expect(fila?.created_at).toBeInstanceOf(Date);
      expect(fila?.updated_at).toBeInstanceOf(Date);
    });

    it('rechaza email duplicado, email con mayusculas, rol/status fuera del enum y karma negativo', async () => {
      const insertar = (email: string, rol = 'USUARIO', status = 'ACTIVO', karma = 0) =>
        codigoDeError(
          bd.url,
          'INSERT INTO usuario (nombre, apellido, email, rol, status, puntos_karma) VALUES ($1, $2, $3, $4, $5, $6)',
          ['N', 'A', email, rol, status, karma],
        );

      expect(await insertar('defecto@crowdradar.pe')).toBe(UNIQUE);
      expect(await insertar('Mayus@crowdradar.pe')).toBe(CHECK);
      expect(await insertar('rol@crowdradar.pe', 'SUPERADMIN')).toBe(CHECK);
      expect(await insertar('status@crowdradar.pe', 'USUARIO', 'BORRADO')).toBe(CHECK);
      expect(await insertar('karma@crowdradar.pe', 'USUARIO', 'ACTIVO', -1)).toBe(CHECK);
      expect(await insertar('valido@crowdradar.pe', 'ADMIN', 'SUSPENDIDO', 5)).toBeUndefined();
    });

    it('db:migrate:undo elimina la tabla y volver a migrar funciona (up/down/up)', async () => {
      const deshacer = await ejecutarCli(['db:migrate:undo:all'], bd.url);
      expect(deshacer.codigo, deshacer.salida).toBe(0);
      expect(await tablas()).toEqual(['SequelizeMeta']);

      const rehacer = await ejecutarCli(['db:migrate'], bd.url);
      expect(rehacer.codigo, rehacer.salida).toBe(0);
      expect(await tablas()).toEqual(['SequelizeMeta', 'usuario']);
    });
  });

  describe('seeder usuario-admin', () => {
    const admin = { ADMIN_EMAIL: 'admin@crowdradar.test', ADMIN_PASSWORD: 'ClaveAdmin123', BCRYPT_COSTO: '4' };

    it('sin ADMIN_EMAIL/ADMIN_PASSWORD falla con un mensaje claro y no inserta nada', async () => {
      const resultado = await ejecutarCli(['db:seed:all'], bd.url, { ADMIN_EMAIL: '', ADMIN_PASSWORD: '' });
      expect(resultado.codigo).not.toBe(0);
      expect(resultado.salida).toContain('ADMIN_EMAIL');
      const filas = await consultar(bd.url, "SELECT 1 FROM usuario WHERE rol = 'ADMIN' AND email = 'admin@crowdradar.test'");
      expect(filas).toHaveLength(0);
    });

    it('inserta un ADMIN activo con hash bcrypt verificable', async () => {
      const resultado = await ejecutarCli(['db:seed:all'], bd.url, admin);
      expect(resultado.codigo, resultado.salida).toBe(0);
      const filas = await consultar<{ rol: string; status: string; password_hash: string }>(
        bd.url,
        'SELECT rol, status, password_hash FROM usuario WHERE email = $1',
        [admin.ADMIN_EMAIL],
      );
      expect(filas).toHaveLength(1);
      expect(filas[0]).toMatchObject({ rol: 'ADMIN', status: 'ACTIVO' });
      expect(filas[0]?.password_hash).not.toContain(admin.ADMIN_PASSWORD);
      expect(await bcrypt.compare(admin.ADMIN_PASSWORD, filas[0]?.password_hash as string)).toBe(true);
    });

    it('es idempotente: ejecutarlo de nuevo deja una sola fila y no cambia el hash', async () => {
      const [antes] = await consultar<{ password_hash: string }>(bd.url, 'SELECT password_hash FROM usuario WHERE email = $1', [admin.ADMIN_EMAIL]);
      const resultado = await ejecutarCli(['db:seed:all'], bd.url, { ...admin, ADMIN_PASSWORD: 'OtraClave123' });
      expect(resultado.codigo, resultado.salida).toBe(0);
      const filas = await consultar<{ password_hash: string }>(bd.url, 'SELECT password_hash FROM usuario WHERE email = $1', [admin.ADMIN_EMAIL]);
      expect(filas).toHaveLength(1);
      expect(filas[0]?.password_hash).toBe(antes?.password_hash);
    });
  });
});
