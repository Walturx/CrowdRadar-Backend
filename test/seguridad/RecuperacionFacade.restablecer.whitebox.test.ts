/**
 * White-box test of RecuperacionFacadeImpl.restablecer.
 * Integrante: M1 (seguridad). Tecnica: caja blanca, cobertura de decisiones sobre el grafo de flujo.
 * Complejidad ciclomatica CC = 7 = 6 decisiones + 1: (1) !registro, (2) registro.usadoEn, (3) vencido,
 * (4) !usuario, (5) password repetida, (6) la reclamacion atomica no gasto ninguna fila.
 * (1) y (2) comparten un solo `if` con `||`; (3) a (6) son un `if` cada uno. Cada camino tiene su caso.
 * Spec M1 R4; HU 2.2.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import type { TokenRecuperacionDAO } from '../../src/dao/TokenRecuperacionDAO.js';
import type { UsuarioDAO } from '../../src/dao/UsuarioDAO.js';
import { PasswordRepetidaException } from '../../src/exception/usuario/PasswordRepetidaException.js';
import { TokenRecuperacionExpiradoException } from '../../src/exception/recuperacion/TokenRecuperacionExpiradoException.js';
import { TokenRecuperacionInvalidoException } from '../../src/exception/recuperacion/TokenRecuperacionInvalidoException.js';
import { asentar, crearEntornoRecuperacion, PASSWORD_ACTUAL, type EntornoRecuperacion } from './entornoRecuperacion.js';

const NUEVA = 'Nueva12345';

describe('RecuperacionFacadeImpl.restablecer (CC = 7)', () => {
  let e: EntornoRecuperacion;
  beforeEach(async () => {
    e = crearEntornoRecuperacion();
    await e.facade.solicitar(e.usuario.email);
    await asentar();
  });

  const hashGuardado = async () => (await e.usuarioDAO.buscarPorId(e.usuario.id))?.passwordHash;

  it('camino 1: token desconocido -> TokenRecuperacionInvalido y no cambia nada', async () => {
    await expect(e.facade.restablecer('otro', NUEVA)).rejects.toBeInstanceOf(TokenRecuperacionInvalidoException);
    expect(await hashGuardado()).toBe(`hash:${PASSWORD_ACTUAL}`);
  });

  it('camino 2: token ya usado -> TokenRecuperacionInvalido (no se puede reutilizar)', async () => {
    await e.facade.restablecer('tok-1', NUEVA);
    await expect(e.facade.restablecer('tok-1', 'Otra123456')).rejects.toBeInstanceOf(TokenRecuperacionInvalidoException);
    expect(await hashGuardado()).toBe(`hash:${NUEVA}`);
  });

  it('camino 3: token vencido -> TokenRecuperacionExpirado y no cambia nada', async () => {
    e.reloj.avanzarMinutos(30);
    await expect(e.facade.restablecer('tok-1', NUEVA)).rejects.toBeInstanceOf(TokenRecuperacionExpiradoException);
    expect(await hashGuardado()).toBe(`hash:${PASSWORD_ACTUAL}`);
  });

  it('camino 4: el usuario del token ya no existe -> TokenRecuperacionInvalido', async () => {
    await e.tokenDAO.crear({ usuarioId: 9999, tokenHash: e.hashDe('tok-x'), expiraEn: new Date(e.reloj.ahora().getTime() + 60_000) });
    await expect(e.facade.restablecer('tok-x', NUEVA)).rejects.toBeInstanceOf(TokenRecuperacionInvalidoException);
  });

  it('camino 5: la nueva password es la actual -> PasswordRepetida y el token sigue vivo', async () => {
    await expect(e.facade.restablecer('tok-1', PASSWORD_ACTUAL)).rejects.toBeInstanceOf(PasswordRepetidaException);
    expect((await e.tokenDAO.buscarPorHash(e.hashDe('tok-1')))?.usadoEn).toBeNull();
    await expect(e.facade.restablecer('tok-1', NUEVA)).resolves.toBeUndefined();
  });

  it('camino 6: otra solicitud gasto el token entre la lectura y la reclamacion -> TokenRecuperacionInvalido', async () => {
    // The race: the token looked live when read, but a concurrent reset spent it before this one claimed it.
    const tokens: TokenRecuperacionDAO = e.tokenDAO;
    const original = tokens.invalidarVigentesDeUsuario.bind(tokens);
    tokens.invalidarVigentesDeUsuario = async (usuarioId, ahora, tx) => {
      await original(usuarioId, ahora, tx);
      return 0;
    };
    await expect(e.facade.restablecer('tok-1', NUEVA)).rejects.toBeInstanceOf(TokenRecuperacionInvalidoException);
  });

  it('camino 7 (exito): una transaccion fija el hash, gasta el token, invalida los demas y sella password_cambiada_en', async () => {
    await e.facade.solicitar(e.usuario.email); // tok-2 invalidates tok-1
    // A second live token of the same user created behind the facade's back, to prove it is invalidated too.
    await e.tokenDAO.crear({ usuarioId: e.usuario.id, tokenHash: e.hashDe('tok-9'), expiraEn: new Date(e.reloj.ahora().getTime() + 600_000) });
    const antes = e.conexion.confirmadas;
    e.reloj.avanzarMinutos(5);

    await e.facade.restablecer('tok-2', NUEVA);

    expect(e.conexion.confirmadas).toBe(antes + 1);
    const usuario = await e.usuarioDAO.buscarPorId(e.usuario.id);
    expect(usuario?.passwordHash).toBe(`hash:${NUEVA}`);
    expect(usuario?.passwordCambiadaEn).toEqual(e.reloj.ahora());
    expect((await e.tokenDAO.buscarPorHash(e.hashDe('tok-2')))?.usadoEn).toEqual(e.reloj.ahora());
    expect((await e.tokenDAO.buscarPorHash(e.hashDe('tok-9')))?.usadoEn).toEqual(e.reloj.ahora());
  });

  it('un fallo dentro de la transaccion se propaga (la conexion revierte) y no confirma', async () => {
    e.usuarioDAO.fallo = new Error('bd caida');
    const antes = e.conexion.confirmadas;
    await expect(e.facade.restablecer('tok-1', NUEVA)).rejects.toThrow('bd caida');
    expect(e.conexion.confirmadas).toBe(antes);
  });

  it('todas las escrituras usan el handle de la transaccion abierta por la fachada', async () => {
    const recibidos: unknown[] = [];
    const tokens: TokenRecuperacionDAO = e.tokenDAO;
    const original = tokens.invalidarVigentesDeUsuario.bind(tokens);
    tokens.invalidarVigentesDeUsuario = async (...args) => {
      recibidos.push(args[2]);
      return original(...args);
    };
    const usuarios: UsuarioDAO = e.usuarioDAO;
    const originalPassword = usuarios.actualizarPasswordHash.bind(usuarios);
    usuarios.actualizarPasswordHash = async (id, hash, tx) => {
      recibidos.push(tx);
      return originalPassword(id, hash, tx);
    };
    await e.facade.restablecer('tok-1', NUEVA);
    expect(recibidos).toHaveLength(2);
    expect(new Set(recibidos).size).toBe(1);
    expect(recibidos[0]).toBe(e.conexion.handles.at(-1));
  });
});
