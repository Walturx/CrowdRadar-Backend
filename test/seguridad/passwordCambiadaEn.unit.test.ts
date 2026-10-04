/** password_cambiada_en is set by actualizarPasswordHash (spec M1 R4, R6; the contract PR is already merged). */
import { describe, expect, it } from 'vitest';
import { RelojFijo } from '../support/RelojFijo.js';
import { UsuarioDAOMemoria } from '../support/dao/memoria/UsuarioDAOMemoria.js';

describe('password_cambiada_en', () => {
  it('is null until the password changes, then equals the change instant', async () => {
    const reloj = new RelojFijo(new Date('2026-10-05T14:00:00Z'));
    const dao = new UsuarioDAOMemoria({ reloj });
    const creado = await dao.crear({ nombre: 'Ana', apellido: 'Ruiz', email: 'a@b.pe', passwordHash: 'h1', telefono: null, distrito: null });
    expect(creado.passwordCambiadaEn).toBeNull();
    reloj.avanzarMinutos(10);
    await dao.actualizarPasswordHash(creado.id, 'h2');
    expect((await dao.buscarPorId(creado.id))?.passwordCambiadaEn).toEqual(reloj.ahora());
  });
});
