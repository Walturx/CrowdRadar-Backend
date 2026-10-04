/** VerificadorEstadoCuentaImpl (M6): the active sanction is the source of truth; expired or missing sanctions reactivate lazily. */
import { beforeEach, describe, expect, it } from 'vitest';
import { CuentaSuspendidaException } from '../../src/exception/usuario/CuentaSuspendidaException.js';
import { EstadoCuenta } from '../../src/enum/EstadoCuenta.js';
import { VerificadorEstadoCuentaImpl } from '../../src/service/impl/VerificadorEstadoCuentaImpl.js';
import { RelojFijo } from '../support/RelojFijo.js';
import { SancionDAOMemoria } from '../support/dao/memoria/SancionDAOMemoria.js';
import { UsuarioDAOMemoria } from '../support/dao/memoria/UsuarioDAOMemoria.js';

const AHORA = new Date('2026-10-05T14:00:00Z');
const MS_DIA = 86_400_000;

describe('VerificadorEstadoCuentaImpl.verificar', () => {
  let usuarioDAO: UsuarioDAOMemoria;
  let sancionDAO: SancionDAOMemoria;
  let verificador: VerificadorEstadoCuentaImpl;

  beforeEach(() => {
    usuarioDAO = new UsuarioDAOMemoria();
    sancionDAO = new SancionDAOMemoria();
    verificador = new VerificadorEstadoCuentaImpl({ usuarioDAO, sancionDAO, reloj: new RelojFijo(AHORA) });
  });

  const suspendido = async () => {
    const usuario = await usuarioDAO.crear({ nombre: 'Ana', apellido: 'Lopez', email: 'ana@crowdradar.pe', passwordHash: 'x', telefono: null, distrito: null });
    return (await usuarioDAO.actualizarStatus(usuario.id, EstadoCuenta.SUSPENDIDO))!;
  };
  const sancionar = (usuarioId: number, inicio: Date, fin: Date) =>
    sancionDAO.crear({ usuarioId, administradorId: 1, dias: 3, motivo: 'Reportes falsos reiterados', fechaInicio: inicio, fechaFin: fin });

  it('devuelve el mismo usuario cuando esta ACTIVO, sin consultar sanciones', async () => {
    const usuario = { ...(await suspendido()), status: EstadoCuenta.ACTIVO };
    await expect(verificador.verificar(usuario)).resolves.toBe(usuario);
  });

  it('SUSPENDIDO con sancion vigente lanza CuentaSuspendidaException con la fecha de fin (S17, S18)', async () => {
    const usuario = await suspendido();
    const fin = new Date(AHORA.getTime() + 2 * MS_DIA);
    await sancionar(usuario.id, new Date(AHORA.getTime() - MS_DIA), fin);
    const error = await verificador.verificar(usuario).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(CuentaSuspendidaException);
    expect(error).toMatchObject({ status: 403, code: 'CUENTA_SUSPENDIDA' });
    expect((error as Error).message).toContain(fin.toISOString());
    expect((await usuarioDAO.buscarPorId(usuario.id))?.status).toBe(EstadoCuenta.SUSPENDIDO);
  });

  it.each([
    ['vencida', 1],
    ['con fecha_fin igual a ahora (S23)', 0],
  ])('SUSPENDIDO con sancion %s se reactiva a ACTIVO y deja pasar', async (_nombre, diasRestantes) => {
    const usuario = await suspendido();
    await sancionar(usuario.id, new Date(AHORA.getTime() - 3 * MS_DIA), new Date(AHORA.getTime() - diasRestantes * MS_DIA));
    const resultado = await verificador.verificar(usuario);
    expect(resultado.status).toBe(EstadoCuenta.ACTIVO);
    expect((await usuarioDAO.buscarPorId(usuario.id))?.status).toBe(EstadoCuenta.ACTIVO);
  });

  it('SUSPENDIDO sin ninguna sancion se reactiva a ACTIVO (S24)', async () => {
    const usuario = await suspendido();
    const resultado = await verificador.verificar(usuario);
    expect(resultado.status).toBe(EstadoCuenta.ACTIVO);
    expect((await usuarioDAO.buscarPorId(usuario.id))?.status).toBe(EstadoCuenta.ACTIVO);
  });
});
