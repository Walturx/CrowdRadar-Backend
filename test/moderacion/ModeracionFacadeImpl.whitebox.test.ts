/**
 * White-box tests of ModeracionFacadeImpl.suspender (rubric M6): every branch of the method, the transaction and the
 * best-effort mail. Spec R4, S13-S16; HU 7.3 c2.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { EstadoCuenta } from '../../src/enum/EstadoCuenta.js';
import { OperacionNoPermitidaException } from '../../src/exception/moderacion/OperacionNoPermitidaException.js';
import { UsuarioYaSuspendidoException } from '../../src/exception/moderacion/UsuarioYaSuspendidoException.js';
import { UsuarioNoEncontradoException } from '../../src/exception/usuario/UsuarioNoEncontradoException.js';
import { ValidacionException } from '../../src/exception/http/ValidacionException.js';
import { AHORA, MS_DIA, armarModeracion } from './entornoModeracion.js';

describe('ModeracionFacadeImpl.suspender (caja blanca)', () => {
  let m: ReturnType<typeof armarModeracion>;
  let adminId: number;
  beforeEach(() => {
    m = armarModeracion();
    adminId = m.admin().id;
  });
  const motivo = 'Reportes falsos reiterados';

  it('un admin no puede suspenderse a si mismo: 422 OPERACION_NO_PERMITIDA, sin tocar nada (S14)', async () => {
    await expect(m.facade.suspender(adminId, adminId, 7, motivo)).rejects.toBeInstanceOf(OperacionNoPermitidaException);
    expect(m.conexion.transacciones).toBe(0);
  });

  it('usuario inexistente: 404 USUARIO_NO_ENCONTRADO', async () => {
    await expect(m.facade.suspender(adminId, 9999, 7, motivo)).rejects.toBeInstanceOf(UsuarioNoEncontradoException);
  });

  it('el objetivo es otro ADMIN: 422, sin sancion (S14)', async () => {
    const otroAdmin = m.admin();
    await expect(m.facade.suspender(adminId, otroAdmin.id, 7, motivo)).rejects.toBeInstanceOf(OperacionNoPermitidaException);
    expect(await m.sancionDAO.buscarVigente(otroAdmin.id, AHORA)).toBeNull();
  });

  it('ya suspendido con sancion vigente: 409 USUARIO_YA_SUSPENDIDO y no crea otra sancion (S15)', async () => {
    const { usuario, sancion } = await m.suspendido(3);
    await expect(m.facade.suspender(adminId, usuario.id, 7, motivo)).rejects.toBeInstanceOf(UsuarioYaSuspendidoException);
    expect((await m.sancionDAO.buscarVigente(usuario.id, AHORA))?.id).toBe(sancion.id);
  });

  it.each([5, 0, 31])('dias=%i fuera del conjunto configurado: 400 VALIDACION_FALLIDA (S16)', async (dias) => {
    const objetivo = m.usuario();
    const error = await m.facade.suspender(adminId, objetivo.id, dias as 3, motivo).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ValidacionException);
    expect(error).toMatchObject({ status: 400, code: 'VALIDACION_FALLIDA' });
  });

  it('respeta el subconjunto configurado: con {3} un 7 se rechaza', async () => {
    const restringido = armarModeracion([3]);
    const objetivo = restringido.usuario();
    await expect(restringido.facade.suspender(restringido.admin().id, objetivo.id, 7, motivo)).rejects.toBeInstanceOf(ValidacionException);
  });

  it('crea la sancion y pasa a SUSPENDIDO en una transaccion: fechaFin = inicio + dias (S13)', async () => {
    const objetivo = m.usuario();
    const sancion = await m.facade.suspender(adminId, objetivo.id, 7, motivo);
    expect(sancion).toMatchObject({ usuarioId: objetivo.id, administradorId: adminId, dias: 7, motivo, tipo: 'SUSPENSION_TEMPORAL' });
    expect(sancion.fechaInicio).toEqual(AHORA);
    expect(sancion.fechaFin).toEqual(new Date(AHORA.getTime() + 7 * MS_DIA));
    expect((await m.usuarioDAO.buscarPorId(objetivo.id))?.status).toBe(EstadoCuenta.SUSPENDIDO);
    expect(m.conexion.transacciones).toBe(1);
  });

  it('un SUSPENDIDO sin sancion vigente (huerfano) se puede volver a suspender', async () => {
    const huerfano = m.usuario({ status: EstadoCuenta.SUSPENDIDO });
    const sancion = await m.facade.suspender(adminId, huerfano.id, 3, motivo);
    expect(sancion.dias).toBe(3);
  });

  it('envia el correo con el motivo escapado despues de confirmar', async () => {
    const objetivo = m.usuario({ email: 'ana@crowdradar.pe' });
    await m.facade.suspender(adminId, objetivo.id, 3, 'Falsos <b>reportes</b> reiterados');
    expect(m.correo.enviados).toHaveLength(1);
    expect(m.correo.enviados[0]).toMatchObject({ para: 'ana@crowdradar.pe' });
    expect(m.correo.enviados[0]!.texto).toContain('Falsos <b>reportes</b> reiterados');
    expect(m.correo.enviados[0]!.html).toContain('Falsos &lt;b&gt;reportes&lt;/b&gt; reiterados');
  });

  it('si el correo falla se registra y la suspension sigue vigente (best effort)', async () => {
    m.correo.fallo = new Error('SMTP caido');
    const objetivo = m.usuario();
    await expect(m.facade.suspender(adminId, objetivo.id, 3, motivo)).resolves.toMatchObject({ dias: 3 });
    expect((await m.usuarioDAO.buscarPorId(objetivo.id))?.status).toBe(EstadoCuenta.SUSPENDIDO);
    expect(m.lineas.some((l) => l.level === 40 && JSON.stringify(l).includes('correo'))).toBe(true);
  });
});
