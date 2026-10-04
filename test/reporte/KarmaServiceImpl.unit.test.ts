/** Unit tests of KarmaServiceImpl: +10 per report, daily cap per Lima day, validation karma, revocation (spec M4 R4, S7-S10). */
import { beforeEach, describe, expect, it } from 'vitest';
import type { ContextoTx } from '../../src/datasource/ConexionBD.js';
import { EstadoReporte } from '../../src/enum/EstadoReporte.js';
import { MotivoSinPuntos } from '../../src/enum/MotivoSinPuntos.js';
import { NivelSaturacion } from '../../src/enum/NivelSaturacion.js';
import { CodigoError } from '../../src/exception/CodigoError.js';
import { UsuarioNoEncontradoException } from '../../src/exception/usuario/UsuarioNoEncontradoException.js';
import { KarmaServiceImpl } from '../../src/service/impl/KarmaServiceImpl.js';
import { RelojFijo } from '../support/RelojFijo.js';
import { ReporteDAOMemoria } from '../support/dao/memoria/ReporteDAOMemoria.js';
import { ValidacionDAOMemoria } from '../support/dao/memoria/ValidacionDAOMemoria.js';
import { TipoAccionValidacion } from '../../src/enum/TipoAccionValidacion.js';
import { UsuarioDAOMemoria } from '../support/dao/memoria/UsuarioDAOMemoria.js';

// 2026-10-05 20:00 in Lima (UTC-5); the Lima day ends at 2026-10-06T05:00:00Z.
const AHORA = new Date('2026-10-06T01:00:00Z');
const TX = {} as ContextoTx;
const DATOS_USUARIO = {
  nombre: 'Ana',
  apellido: 'Perez',
  email: 'ana@crowdradar.pe',
  passwordHash: 'hash',
  telefono: null,
  distrito: null,
};

describe('KarmaServiceImpl', () => {
  let reloj: RelojFijo;
  let usuarioDAO: UsuarioDAOMemoria;
  let reporteDAO: ReporteDAOMemoria;
  let servicio: KarmaServiceImpl;
  let usuarioId: number;
  let secuencia: number;

  const nuevoReporte = (fechaHora: Date = reloj.ahora()) =>
    reporteDAO.crear({ usuarioId, lugarId: ++secuencia, nivelSaturacion: NivelSaturacion.MODERADO, fechaHora });
  /** Creates a report the way the facade does and asks for its karma. */
  const reportarYOtorgar = async () => servicio.otorgarPorReporte(usuarioId, (await nuevoReporte()).id, TX);
  const karmaDe = async () => (await usuarioDAO.buscarPorId(usuarioId))?.puntosKarma;

  beforeEach(async () => {
    secuencia = 0;
    reloj = new RelojFijo(AHORA);
    usuarioDAO = new UsuarioDAOMemoria();
    reporteDAO = new ReporteDAOMemoria();
    servicio = new KarmaServiceImpl({
      usuarioDAO,
      reporteDAO,
      reloj,
      karmaPorReporte: 10,
      karmaPorValidacion: 2,
      reportesPremiadosPorDia: 5,
      zonaHoraria: 'America/Lima',
    });
    usuarioId = (await usuarioDAO.crear(DATOS_USUARIO)).id;
  });

  describe('otorgarPorReporte', () => {
    it('el primer reporte del dia da +10 y guarda los puntos en el reporte', async () => {
      const reporte = await nuevoReporte();
      const resultado = await servicio.otorgarPorReporte(usuarioId, reporte.id, TX);
      expect(resultado).toEqual({ puntosGanados: 10, total: 10, motivoSinPuntos: null });
      expect(await karmaDe()).toBe(10);
      expect(await reporteDAO.buscarPorId(reporte.id)).toMatchObject({ puntosOtorgados: 10, motivoSinPuntos: null });
    });

    it('el quinto reporte del dia todavia es premiado', async () => {
      for (let i = 0; i < 4; i += 1) await reportarYOtorgar();
      const quinto = await reportarYOtorgar();
      expect(quinto).toEqual({ puntosGanados: 10, total: 50, motivoSinPuntos: null });
    });

    it('el sexto reporte del dia no da puntos: TOPE_DIARIO y el total no cambia', async () => {
      for (let i = 0; i < 5; i += 1) await reportarYOtorgar();
      const reporte = await nuevoReporte();
      const sexto = await servicio.otorgarPorReporte(usuarioId, reporte.id, TX);
      expect(sexto).toEqual({ puntosGanados: 0, total: 50, motivoSinPuntos: MotivoSinPuntos.TOPE_DIARIO });
      expect(await karmaDe()).toBe(50);
      expect(await reporteDAO.buscarPorId(reporte.id)).toMatchObject({ puntosOtorgados: 0, motivoSinPuntos: 'TOPE_DIARIO' });
    });

    it('al dia siguiente de Lima se vuelve a premiar', async () => {
      for (let i = 0; i < 6; i += 1) await reportarYOtorgar();
      reloj.avanzarMinutos(5 * 60); // 01:00Z + 5 h = 06:00Z = 01:00 of the next Lima day
      const manana = await reportarYOtorgar();
      expect(manana).toEqual({ puntosGanados: 10, total: 60, motivoSinPuntos: null });
    });

    it('el tope usa el dia de Lima y no el dia UTC: 23:30 y 00:30 de Lima son dias distintos', async () => {
      reloj = new RelojFijo(new Date('2026-10-06T04:30:00Z')); // 23:30 Lima, already 04:30 UTC of the 6th
      servicio = new KarmaServiceImpl({ usuarioDAO, reporteDAO, reloj, karmaPorReporte: 10, karmaPorValidacion: 2, reportesPremiadosPorDia: 1, zonaHoraria: 'America/Lima' });
      await reportarYOtorgar();
      expect((await reportarYOtorgar()).motivoSinPuntos).toBe('TOPE_DIARIO');
      reloj.avanzarMinutos(60); // 05:30Z = 00:30 Lima of the next day
      expect((await reportarYOtorgar()).puntosGanados).toBe(10);
    });

    it('dos otorgamientos en paralelo suman +20 (incremento atomico)', async () => {
      const [a, b] = await Promise.all([nuevoReporte(), nuevoReporte()]);
      await Promise.all([servicio.otorgarPorReporte(usuarioId, a.id, TX), servicio.otorgarPorReporte(usuarioId, b.id, TX)]);
      expect(await karmaDe()).toBe(20);
    });

    it('un usuario inexistente lanza UsuarioNoEncontrado', async () => {
      const reporte = await nuevoReporte();
      await expect(servicio.otorgarPorReporte(999_999, reporte.id, TX)).rejects.toBeInstanceOf(UsuarioNoEncontradoException);
    });
  });

  describe('otorgarPorValidacion', () => {
    it('suma +2 al votante y devuelve los puntos concedidos', async () => {
      expect(await servicio.otorgarPorValidacion(usuarioId, TX)).toBe(2);
      expect(await servicio.otorgarPorValidacion(usuarioId, TX)).toBe(2);
      expect(await karmaDe()).toBe(4);
    });

    describe('tope diario (KARMA_VALIDACION_MAX_DIA)', () => {
      let validacionDAO: ValidacionDAOMemoria;
      const votar = (puntosOtorgados: number, fechaHora: Date) =>
        validacionDAO.crear({ reporteId: ++secuencia, usuarioId, tipoAccion: TipoAccionValidacion.CONFIRMAR, karmaVotante: 0, puntosOtorgados, fechaHora });

      beforeEach(() => {
        validacionDAO = new ValidacionDAOMemoria();
        servicio = new KarmaServiceImpl({
          usuarioDAO, reporteDAO, reloj, karmaPorReporte: 10, karmaPorValidacion: 2, reportesPremiadosPorDia: 5, zonaHoraria: 'America/Lima',
          validacionDAO, karmaValidacionMaxDia: 5,
        });
      });

      it('con el tope alcanzado hoy otorga 0 y no suma karma', async () => {
        await votar(5, AHORA);
        expect(await servicio.otorgarPorValidacion(usuarioId, TX)).toBe(0);
        expect(await karmaDe()).toBe(0);
      });

      it('otorga solo lo que falta para el tope', async () => {
        await votar(4, AHORA);
        expect(await servicio.otorgarPorValidacion(usuarioId, TX)).toBe(1);
        expect(await karmaDe()).toBe(1);
      });

      it('los votos de ayer (dia de Lima) no cuentan', async () => {
        await votar(5, new Date('2026-10-05T04:00:00Z')); // 23:00 Lima of the 4th
        expect(await servicio.otorgarPorValidacion(usuarioId, TX)).toBe(2);
      });
    });

    it('un usuario inexistente lanza UsuarioNoEncontradoException, igual que otorgarPorReporte', async () => {
      await expect(servicio.otorgarPorValidacion(999_999, TX)).rejects.toBeInstanceOf(UsuarioNoEncontradoException);
    });
  });

  describe('revocarPorReporteEliminado', () => {
    it('resta los puntos del reporte, anota REPORTE_ELIMINADO y nunca baja de 0', async () => {
      await usuarioDAO.incrementarKarma(usuarioId, 4); // the user already spent karma elsewhere: 4 < 10 points to take back
      const reporte = await nuevoReporte();
      await reporteDAO.registrarPuntos(reporte.id, 10, null);
      await servicio.revocarPorReporteEliminado(reporte.id, TX);
      expect(await karmaDe()).toBe(0);
      expect(await reporteDAO.buscarPorId(reporte.id)).toMatchObject({ puntosOtorgados: 0, motivoSinPuntos: 'REPORTE_ELIMINADO' });
    });

    it('con karma suficiente resta exactamente lo concedido', async () => {
      await reportarYOtorgar();
      const segundo = await nuevoReporte();
      await servicio.otorgarPorReporte(usuarioId, segundo.id, TX);
      await servicio.revocarPorReporteEliminado(segundo.id, TX);
      expect(await karmaDe()).toBe(10);
    });

    it('un reporte que no dio puntos no cambia el karma', async () => {
      await usuarioDAO.incrementarKarma(usuarioId, 30);
      const reporte = await nuevoReporte();
      await reporteDAO.registrarPuntos(reporte.id, 0, MotivoSinPuntos.TOPE_DIARIO);
      await servicio.revocarPorReporteEliminado(reporte.id, TX);
      expect(await karmaDe()).toBe(30);
    });

    it('un reporte inexistente lanza 404 REPORTE_NO_ENCONTRADO', async () => {
      await expect(servicio.revocarPorReporteEliminado(424242, TX)).rejects.toMatchObject({
        status: 404,
        code: CodigoError.REPORTE_NO_ENCONTRADO,
      });
    });

    it('un reporte ya ELIMINADO con puntos tambien se revoca una sola vez', async () => {
      await usuarioDAO.incrementarKarma(usuarioId, 25);
      const reporte = await nuevoReporte();
      await reporteDAO.registrarPuntos(reporte.id, 10, null);
      await reporteDAO.actualizarEstado(reporte.id, EstadoReporte.ELIMINADO);
      await servicio.revocarPorReporteEliminado(reporte.id, TX);
      await servicio.revocarPorReporteEliminado(reporte.id, TX);
      expect(await karmaDe()).toBe(15);
    });
  });
});
