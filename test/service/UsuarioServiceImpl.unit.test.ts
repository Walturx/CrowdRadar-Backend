/** Unit tests of UsuarioServiceImpl: profile read/update and password change (design 4.1; spec R-B3). */
import { beforeEach, describe, expect, it } from 'vitest';
import { PasswordActualIncorrectaException } from '../../src/exception/usuario/PasswordActualIncorrectaException.js';
import { PasswordRepetidaException } from '../../src/exception/usuario/PasswordRepetidaException.js';
import { UsuarioNoEncontradoException } from '../../src/exception/usuario/UsuarioNoEncontradoException.js';
import { UsuarioServiceImpl } from '../../src/service/impl/UsuarioServiceImpl.js';
import { HasherFalso } from '../support/adapter/HasherFalso.js';
import { UsuarioDAOMemoria } from '../support/dao/memoria/UsuarioDAOMemoria.js';

describe('UsuarioServiceImpl', () => {
  let dao: UsuarioDAOMemoria;
  let servicio: UsuarioServiceImpl;
  let id: number;

  beforeEach(async () => {
    dao = new UsuarioDAOMemoria();
    servicio = new UsuarioServiceImpl({ usuarioDAO: dao, hasher: new HasherFalso() });
    const ana = await dao.crear({
      nombre: 'Ana',
      apellido: 'Perez',
      email: 'ana@crowdradar.pe',
      passwordHash: 'hash:Vieja1234',
      telefono: '987654321',
      distrito: 'Lince',
    });
    id = ana.id;
  });

  describe('obtenerPerfil', () => {
    it('devuelve { user } sin el hash', async () => {
      const perfil = await servicio.obtenerPerfil(id);
      expect(perfil.user).toMatchObject({ id, email: 'ana@crowdradar.pe', distrito: 'Lince' });
      expect(JSON.stringify(perfil)).not.toContain('hash:');
    });

    it('usuario inexistente lanza UsuarioNoEncontrado (404)', async () => {
      await expect(servicio.obtenerPerfil(999)).rejects.toBeInstanceOf(UsuarioNoEncontradoException);
    });
  });

  describe('actualizarPerfil', () => {
    it('cambia solo lo enviado y permite limpiar el telefono con null', async () => {
      const perfil = await servicio.actualizarPerfil(id, { nombre: 'Anita', telefono: null });
      expect(perfil.user).toMatchObject({ nombre: 'Anita', apellido: 'Perez', telefono: null, distrito: 'Lince' });
    });

    it('usuario inexistente lanza UsuarioNoEncontrado', async () => {
      await expect(servicio.actualizarPerfil(999, { nombre: 'X' })).rejects.toBeInstanceOf(UsuarioNoEncontradoException);
    });
  });

  describe('cambiarPassword', () => {
    const dto = { passwordActual: 'Vieja1234', nuevaPassword: 'Nueva12345', confirmarPassword: 'Nueva12345' };

    it('guarda el hash de la nueva password', async () => {
      await servicio.cambiarPassword(id, dto);
      expect((await dao.buscarPorId(id))?.passwordHash).toBe('hash:Nueva12345');
    });

    it('password actual incorrecta lanza 422 PasswordActualIncorrecta y no cambia nada', async () => {
      const error = await servicio.cambiarPassword(id, { ...dto, passwordActual: 'Equivocada1' }).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(PasswordActualIncorrectaException);
      expect((error as PasswordActualIncorrectaException).status).toBe(422);
      expect((await dao.buscarPorId(id))?.passwordHash).toBe('hash:Vieja1234');
    });

    it('nueva igual a la actual lanza 422 PasswordRepetida', async () => {
      const igual = { passwordActual: 'Vieja1234', nuevaPassword: 'Vieja1234', confirmarPassword: 'Vieja1234' };
      await expect(servicio.cambiarPassword(id, igual)).rejects.toBeInstanceOf(PasswordRepetidaException);
    });

    it('usuario inexistente lanza UsuarioNoEncontrado', async () => {
      await expect(servicio.cambiarPassword(999, dto)).rejects.toBeInstanceOf(UsuarioNoEncontradoException);
    });
  });
});
