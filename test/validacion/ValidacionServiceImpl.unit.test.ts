/** Unit tests of ValidacionServiceImpl with in-memory DAOs (spec M5 R1-R4, S1-S9, S14). */
import { beforeEach, describe, expect, it } from 'vitest';
import { EstadoReporte } from '../../src/enum/EstadoReporte.js';
import { EstadoValidacion } from '../../src/enum/EstadoValidacion.js';
import { NivelConfiabilidad } from '../../src/enum/NivelConfiabilidad.js';
import { TipoAccionValidacion } from '../../src/enum/TipoAccionValidacion.js';
import { CodigoError } from '../../src/exception/CodigoError.js';
import { ConfiabilidadPonderadaKarmaStrategy } from '../../src/pattern/strategy/confiabilidad/impl/ConfiabilidadPonderadaKarmaStrategy.js';
import { KarmaServiceImpl } from '../../src/service/impl/KarmaServiceImpl.js';
import { ValidacionServiceImpl } from '../../src/service/impl/ValidacionServiceImpl.js';
import { distanciaMetros } from '../../src/util/geo.js';
import { ConexionFalsa } from '../support/ConexionFalsa.js';
import { RelojFijo } from '../support/RelojFijo.js';
import { DenunciaDAOMemoria } from '../support/dao/memoria/DenunciaDAOMemoria.js';
import { LugarDAOMemoria } from '../support/dao/memoria/LugarDAOMemoria.js';
import { ReporteDAOMemoria } from '../support/dao/memoria/ReporteDAOMemoria.js';
import { UsuarioDAOMemoria } from '../support/dao/memoria/UsuarioDAOMemoria.js';
import { ValidacionDAOMemoria } from '../support/dao/memoria/ValidacionDAOMemoria.js';
import { aReporte, aUsuario } from '../support/fabrica/datos.js';

const AHORA = new Date('2026-10-05T15:00:00Z');
const C = TipoAccionValidacion.CONFIRMAR;
const R = TipoAccionValidacion.RECHAZAR;
const CENTRO = { lat: -12.1, lng: -77.03 };
/** About 1 km per 0.009 degrees of latitude. */
const alNorte = (km: number) => ({ latitud: CENTRO.lat + km * 0.009, longitud: CENTRO.lng });
const haceMinutos = (n: number) => new Date(AHORA.getTime() - n * 60_000);

describe('ValidacionServiceImpl', () => {
  let usuarioDAO: UsuarioDAOMemoria;
  let reporteDAO: ReporteDAOMemoria;
  let lugarDAO: LugarDAOMemoria;
  let validacionDAO: ValidacionDAOMemoria;
  let denunciaDAO: DenunciaDAOMemoria;
  let conexion: ConexionFalsa;
  let servicio: ValidacionServiceImpl;
  let autor: number;
  let votante: number;
  let lugarId: number;
  let reporteId: number;

  const usuario = (karma = 0) => usuarioDAO.agregar(aUsuario({ puntosKarma: karma })).id;
  const reporteDe = (usuarioId: number, sobrescritos = {}) =>
    reporteDAO.agregar(aReporte({ usuarioId, lugarId, fechaHora: haceMinutos(30), ...sobrescritos })).id;
  const votoDe = (usuarioId: number, reporte: number, tipoAccion: TipoAccionValidacion, karmaVotante = 0) =>
    validacionDAO.crear({ reporteId: reporte, usuarioId, tipoAccion, karmaVotante, puntosOtorgados: 2, fechaHora: AHORA });
  /** Votes by fresh users (karma 0, weight 1). */
  const votosNuevos = async (reporte: number, confirman: number, rechazan: number) => {
    for (let i = 0; i < confirman + rechazan; i += 1) await votoDe(usuario(), reporte, i < confirman ? C : R);
  };

  beforeEach(() => {
    const reloj = new RelojFijo(AHORA);
    usuarioDAO = new UsuarioDAOMemoria();
    reporteDAO = new ReporteDAOMemoria();
    lugarDAO = new LugarDAOMemoria();
    validacionDAO = new ValidacionDAOMemoria();
    denunciaDAO = new DenunciaDAOMemoria();
    conexion = new ConexionFalsa();
    servicio = new ValidacionServiceImpl({
      reporteDAO,
      lugarDAO,
      validacionDAO,
      denunciaDAO,
      usuarioDAO,
      karmaService: new KarmaServiceImpl({
        usuarioDAO,
        reporteDAO,
        reloj,
        karmaPorReporte: 10,
        karmaPorValidacion: 2,
        reportesPremiadosPorDia: 5,
        zonaHoraria: 'America/Lima',
      }),
      estrategia: new ConfiabilidadPonderadaKarmaStrategy({ minVotos: 3, umbralAlta: 70, umbralMedia: 40, topeKarmaPeso: 500 }),
      conexion,
      reloj,
      minVotosEstado: 10,
      karmaPorValidacion: 2,
      limiteLugares: 200,
    });
    autor = usuario();
    votante = usuario(40);
    lugarId = lugarDAO.agregar(alNorte(0)).id;
    reporteId = reporteDe(autor);
  });

  describe('validar', () => {
    it('guarda el voto con el karma del votante, suma +2 y devuelve la confiabilidad (S1)', async () => {
      const resultado = await servicio.validar(votante, reporteId, C);
      expect(resultado.validacion).toMatchObject({ reporteId, usuarioId: votante, tipoAccion: C, karmaVotante: 40, puntosOtorgados: 2 });
      expect(resultado.karma).toEqual({ puntosGanados: 2, total: 42 });
      expect((await usuarioDAO.buscarPorId(votante))?.puntosKarma).toBe(42);
      expect(resultado.confiabilidad).toMatchObject({
        nivel: NivelConfiabilidad.INSUFICIENTE,
        porcentaje: null,
        confirmaciones: 1,
        rechazos: 0,
        estado: EstadoValidacion.EN_VALIDACION,
      });
      expect(conexion.transacciones).toBe(1);
    });

    it('recalcula y guarda nivel_confiabilidad cuando ya hay votos suficientes (S7)', async () => {
      await votosNuevos(reporteId, 1, 1);
      const resultado = await servicio.validar(votante, reporteId, C);
      // pesos 1, 1 y 1.4 (karma 40): confirman 1 + 1.4 = 2.4 de 3.4
      expect(resultado.confiabilidad).toMatchObject({ porcentaje: 70.59, nivel: NivelConfiabilidad.ALTA });
      expect((await reporteDAO.buscarPorId(reporteId))?.nivelConfiabilidad).toBe(70.59);
    });

    it('no toca nivel_confiabilidad mientras es INSUFICIENTE', async () => {
      await servicio.validar(votante, reporteId, R);
      expect((await reporteDAO.buscarPorId(reporteId))?.nivelConfiabilidad).toBeNull();
    });

    it('un voto repetido es 409 VALIDACION_DUPLICADA y no cambia el karma (S3)', async () => {
      await servicio.validar(votante, reporteId, C);
      await expect(servicio.validar(votante, reporteId, R)).rejects.toMatchObject({
        status: 409,
        code: CodigoError.VALIDACION_DUPLICADA,
      });
      expect((await usuarioDAO.buscarPorId(votante))?.puntosKarma).toBe(42);
      expect(await validacionDAO.listarVotos(reporteId)).toHaveLength(1);
    });

    it('votar el propio reporte es 422 AUTOVALIDACION_NO_PERMITIDA sin voto ni karma (S4)', async () => {
      await expect(servicio.validar(autor, reporteId, C)).rejects.toMatchObject({
        status: 422,
        code: CodigoError.AUTOVALIDACION_NO_PERMITIDA,
      });
      expect(await validacionDAO.listarVotos(reporteId)).toHaveLength(0);
      expect((await usuarioDAO.buscarPorId(autor))?.puntosKarma).toBe(0);
    });

    it('un reporte inexistente o eliminado es 404 REPORTE_NO_ENCONTRADO, antes que cualquier otra regla', async () => {
      await expect(servicio.validar(votante, 9999, C)).rejects.toMatchObject({ status: 404, code: CodigoError.REPORTE_NO_ENCONTRADO });
      const eliminado = reporteDe(autor, { estado: EstadoReporte.ELIMINADO });
      await expect(servicio.validar(autor, eliminado, C)).rejects.toMatchObject({ status: 404 });
    });

    it('un voto simultaneo que pierde la carrera tambien es 409 y no da karma', async () => {
      await votoDe(votante, reporteId, C);
      validacionDAO.buscarPorUsuarioYReporte = async () => null; // the second request passed the check before the first saved
      await expect(servicio.validar(votante, reporteId, C)).rejects.toMatchObject({ code: CodigoError.VALIDACION_DUPLICADA });
      expect((await usuarioDAO.buscarPorId(votante))?.puntosKarma).toBe(40);
    });

    it('si guardar la confiabilidad falla, el error sale de la transaccion (la BD deshace todo)', async () => {
      await votosNuevos(reporteId, 2, 0);
      reporteDAO.actualizarConfiabilidad = async () => {
        throw new Error('bd caida');
      };
      await expect(servicio.validar(votante, reporteId, C)).rejects.toThrow('bd caida');
      expect(conexion.transacciones).toBe(1);
    });
  });

  describe('consultarConfiabilidad y obtenerReporte', () => {
    it('cuenta confirmaciones y rechazos sin ponderar y deriva el estado', async () => {
      await votosNuevos(reporteId, 12, 1);
      expect(await servicio.consultarConfiabilidad(reporteId)).toMatchObject({
        confirmaciones: 12,
        rechazos: 1,
        votos: 13,
        estado: EstadoValidacion.VALIDADO,
        nivel: NivelConfiabilidad.ALTA,
      });
    });

    it('un reporte sin votos es SIN_VALIDACIONES (S9)', async () => {
      expect(await servicio.consultarConfiabilidad(reporteId)).toMatchObject({ estado: 'SIN_VALIDACIONES', votos: 0, porcentaje: null });
    });

    it('404 para inexistente o eliminado', async () => {
      await expect(servicio.consultarConfiabilidad(9999)).rejects.toMatchObject({ code: CodigoError.REPORTE_NO_ENCONTRADO });
      const eliminado = reporteDe(autor, { estado: EstadoReporte.ELIMINADO });
      await expect(servicio.obtenerReporte(votante, eliminado)).rejects.toMatchObject({ status: 404 });
    });

    it('el detalle trae mi voto, si ya denuncie y si es mio (S2)', async () => {
      await votoDe(votante, reporteId, R);
      await denunciaDAO.crear({ reporteId, usuarioId: votante, motivo: 'SPAM', detalle: null, fechaHora: AHORA });
      const mio = await servicio.obtenerReporte(votante, reporteId);
      expect(mio).toMatchObject({ miValidacion: R, yaDenunciado: true, esPropio: false });
      expect(mio.lugar.id).toBe(lugarId);
      expect(await servicio.obtenerReporte(autor, reporteId)).toMatchObject({ miValidacion: null, yaDenunciado: false, esPropio: true });
    });
  });

  describe('consultarEstadoMisReportes', () => {
    it('lista mis reportes con conteos y estado, y SIN_VALIDACIONES si nadie voto (S8, S9)', async () => {
      const reciente = reporteDe(autor, { fechaHora: haceMinutos(10) });
      await votosNuevos(reporteId, 2, 9);
      const pagina = await servicio.consultarEstadoMisReportes(autor, { page: 1, size: 20 });
      expect(pagina.total).toBe(2);
      expect(pagina.items.map((i) => i.reporte.id)).toEqual([reciente, reporteId]);
      expect(pagina.items[0]?.confiabilidad).toMatchObject({ estado: 'SIN_VALIDACIONES', confirmaciones: 0, rechazos: 0 });
      expect(pagina.items[1]?.confiabilidad).toMatchObject({ estado: 'RECHAZADO', confirmaciones: 2, rechazos: 9 });
    });
  });

  describe('listarPendientes (S14)', () => {
    const consulta = { ...CENTRO, radioKm: 5, horas: 3, page: 1, size: 20 };
    const lugarA = (km: number) => lugarDAO.agregar(alNorte(km)).id;

    it('ordena por distancia del lugar y luego por fecha descendente', async () => {
      const cerca = lugarA(1);
      const lejos = lugarA(3);
      const lejosViejo = reporteDe(autor, { lugarId: lejos, fechaHora: haceMinutos(60) });
      const lejosNuevo = reporteDe(autor, { lugarId: lejos, fechaHora: haceMinutos(5) });
      const cercaViejo = reporteDe(autor, { lugarId: cerca, fechaHora: haceMinutos(100) });
      const pagina = await servicio.listarPendientes(votante, consulta);
      // the report created in beforeEach sits at the centre (distance 0), so it comes first
      expect(pagina.items.map((i) => i.reporte.id)).toEqual([reporteId, cercaViejo, lejosNuevo, lejosViejo]);
      expect(pagina.items[1]?.distanciaMetros).toBeGreaterThan(900);
      expect(pagina.items[1]?.distanciaMetros).toBeLessThan(1100);
      expect(pagina.total).toBe(4);
    });

    it('excluye mis reportes, los que ya vote, eliminados, fuera del radio y fuera de la ventana', async () => {
      const dentro = lugarA(1);
      const fuera = lugarA(8);
      await votoDe(votante, reporteId, C);
      reporteDe(votante, { lugarId: dentro });
      reporteDe(autor, { lugarId: dentro, estado: EstadoReporte.ELIMINADO });
      reporteDe(autor, { lugarId: fuera });
      reporteDe(autor, { lugarId: dentro, fechaHora: haceMinutos(181) });
      const visible = reporteDe(autor, { lugarId: dentro });
      const pagina = await servicio.listarPendientes(votante, consulta);
      expect(pagina.items.map((i) => i.reporte.id)).toEqual([visible]);
    });

    it('el borde de horas incluye: un reporte de justo 3 h entra y uno de 3 h y 1 min no', async () => {
      const enElBorde = reporteDe(autor, { fechaHora: haceMinutos(180) });
      const pasado = reporteDe(autor, { fechaHora: haceMinutos(181) });
      const ids = (await servicio.listarPendientes(votante, consulta)).items.map((i) => i.reporte.id);
      expect(ids).toContain(enElBorde);
      expect(ids).not.toContain(pasado);
    });

    it('el borde del radio se mide en metros sobre el lugar del reporte', async () => {
      const lugar = lugarDAO.agregar(alNorte(2));
      const reporte = reporteDe(autor, { lugarId: lugar.id });
      const metros = distanciaMetros(CENTRO, { lat: lugar.latitud, lng: lugar.longitud });
      const dentro = await servicio.listarPendientes(votante, { ...consulta, radioKm: (metros + 1) / 1000 });
      const fuera = await servicio.listarPendientes(votante, { ...consulta, radioKm: (metros - 1) / 1000 });
      expect(dentro.items.map((i) => i.reporte.id)).toContain(reporte);
      expect(fuera.items.map((i) => i.reporte.id)).not.toContain(reporte);
    });

    it('pagina el resultado ordenado y devuelve la confiabilidad de cada reporte', async () => {
      const cerca = lugarA(1);
      const conVotos = reporteDe(autor, { lugarId: cerca });
      reporteDe(autor, { lugarId: cerca });
      reporteDe(autor, { lugarId: cerca });
      await votosNuevos(conVotos, 3, 0);
      const segunda = await servicio.listarPendientes(votante, { ...consulta, size: 2, page: 2 });
      expect(segunda).toMatchObject({ page: 2, size: 2, total: 4, totalPaginas: 2 });
      expect(segunda.items).toHaveLength(2);
      const todos = await servicio.listarPendientes(votante, { ...consulta, size: 4 });
      expect(todos.items.find((i) => i.reporte.id === conVotos)?.confiabilidad).toMatchObject({ confirmaciones: 3, nivel: 'ALTA' });
    });

    it('sin resultados devuelve una pagina vacia, no un error', async () => {
      const pagina = await servicio.listarPendientes(votante, { ...consulta, lat: 10, lng: 10 });
      expect(pagina).toEqual({ items: [], page: 1, size: 20, total: 0, totalPaginas: 0 });
    });
  });
});
