/**
 * Integrante: stream M3 (favoritos y alertas)
 * Tecnica: caja negra (particiones: token nuevo, propio repetido, ajeno; borrar propio, ajeno, inexistente)
 * Metodo: DispositivoServiceImpl.registrar / eliminar (spec M3 R7, S25; regla un token = un usuario)
 */
import { describe, expect, it } from 'vitest';
import { PlataformaPush } from '../../src/enum/PlataformaPush.js';
import { DispositivoServiceImpl } from '../../src/service/impl/DispositivoServiceImpl.js';
import { DispositivoDAOMemoria } from '../support/dao/memoria/DispositivoDAOMemoria.js';

function armar(maxPorUsuario?: number) {
  const dispositivoDAO = new DispositivoDAOMemoria();
  return { dispositivoDAO, service: new DispositivoServiceImpl({ dispositivoDAO, maxPorUsuario }) };
}

describe('DispositivoServiceImpl.registrar', () => {
  it('un token nuevo se crea (creado true) para el usuario', async () => {
    const { service, dispositivoDAO } = armar();
    expect(await service.registrar(1, 'tok-1', PlataformaPush.ANDROID)).toEqual({ creado: true });
    expect(await dispositivoDAO.listarTokensPorUsuario(1)).toEqual(['tok-1']);
  });

  it('el mismo usuario repite el token: no duplica y informa creado false', async () => {
    const { service, dispositivoDAO } = armar();
    await service.registrar(1, 'tok-1', PlataformaPush.ANDROID);
    expect(await service.registrar(1, 'tok-1', PlataformaPush.IOS)).toEqual({ creado: false });
    expect(await dispositivoDAO.listarTokensPorUsuario(1)).toEqual(['tok-1']);
  });

  it('otro usuario registra el mismo token: se reasigna y el dueno anterior deja de tenerlo', async () => {
    const { service, dispositivoDAO } = armar();
    await service.registrar(1, 'tok-1', PlataformaPush.ANDROID);
    expect(await service.registrar(2, 'tok-1', PlataformaPush.ANDROID)).toEqual({ creado: false });
    expect(await dispositivoDAO.listarTokensPorUsuario(1)).toEqual([]);
    expect(await dispositivoDAO.listarTokensPorUsuario(2)).toEqual(['tok-1']);
  });
});

describe('DispositivoServiceImpl.registrar: tope de dispositivos por usuario', () => {
  it('al pasar el tope se borra el dispositivo mas antiguo y quedan los mas recientes', async () => {
    const { service, dispositivoDAO } = armar(2);
    for (const token of ['a', 'b', 'c']) await service.registrar(1, token, PlataformaPush.ANDROID);
    expect(await dispositivoDAO.listarTokensPorUsuario(1)).toEqual(['b', 'c']);
  });

  it('volver a registrar un token lo mantiene: se borra el que lleva mas sin registrarse', async () => {
    const { service, dispositivoDAO } = armar(2);
    for (const token of ['a', 'b']) await service.registrar(1, token, PlataformaPush.ANDROID);
    await service.registrar(1, 'a', PlataformaPush.ANDROID);
    await service.registrar(1, 'c', PlataformaPush.ANDROID);
    expect((await dispositivoDAO.listarTokensPorUsuario(1)).sort()).toEqual(['a', 'c']);
  });

  it('el tope es por usuario: los dispositivos de otro usuario no cuentan ni se borran', async () => {
    const { service, dispositivoDAO } = armar(1);
    await service.registrar(1, 'a', PlataformaPush.ANDROID);
    await service.registrar(2, 'b', PlataformaPush.IOS);
    expect(await dispositivoDAO.listarTokensPorUsuario(1)).toEqual(['a']);
    expect(await dispositivoDAO.listarTokensPorUsuario(2)).toEqual(['b']);
  });

  it('por defecto el tope es 10', async () => {
    const { service, dispositivoDAO } = armar();
    for (let i = 1; i <= 12; i++) await service.registrar(1, `t${i}`, PlataformaPush.ANDROID);
    expect(await dispositivoDAO.listarTokensPorUsuario(1)).toHaveLength(10);
  });
});

describe('DispositivoServiceImpl.eliminar', () => {
  it('borra el token propio', async () => {
    const { service, dispositivoDAO } = armar();
    await service.registrar(1, 'tok-1', PlataformaPush.ANDROID);
    await service.eliminar(1, 'tok-1');
    expect(await dispositivoDAO.listarTokensPorUsuario(1)).toEqual([]);
  });

  it('un token ajeno o inexistente resuelve sin error y no toca al dueno real', async () => {
    const { service, dispositivoDAO } = armar();
    await service.registrar(2, 'tok-2', PlataformaPush.IOS);
    await expect(service.eliminar(1, 'tok-2')).resolves.toBeUndefined();
    await expect(service.eliminar(1, 'no-existe')).resolves.toBeUndefined();
    expect(await dispositivoDAO.listarTokensPorUsuario(2)).toEqual(['tok-2']);
  });
});
