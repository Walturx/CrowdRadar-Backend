/**
 * Shared contract every ReporteDAO implementation must satisfy (in-memory fake now,
 * Sequelize in M4/M5). Spec M4 R1-R5, R7, R9, R11-R13; design 4.4, 4.6.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { ForeignKeyConstraintError } from 'sequelize';
import type { ReporteDAO } from '../../src/dao/ReporteDAO.js';
import { EstadoReporte } from '../../src/enum/EstadoReporte.js';
import { FiltroDias } from '../../src/enum/FiltroDias.js';
import { MotivoSinPuntos } from '../../src/enum/MotivoSinPuntos.js';
import { NivelSaturacion } from '../../src/enum/NivelSaturacion.js';
import { casosPaginacion } from './paginacion.contract.js';
import { ID_INEXISTENTE, type Sembrador } from './Sembrador.js';

export interface EntornoReporteDAO {
  dao: ReporteDAO;
  sembrador: Sembrador;
}

const LIMA = 'America/Lima';
const T0 = new Date('2026-10-05T14:00:00Z'); // Monday 09:00 in Lima
const desplazar = (base: Date, minutos: number) => new Date(base.getTime() + minutos * 60_000);

export function contratoReporteDAO(nombre: string, crearEntorno: () => Promise<EntornoReporteDAO>): void {
  describe(`ReporteDAO contract: ${nombre}`, () => {
    let dao: ReporteDAO;
    let usuarioId: number;
    let lugarId: number;
    let sembrador: Sembrador;
    const crear = (nivel: NivelSaturacion, fechaHora: Date, extra: { usuarioId?: number; lugarId?: number } = {}) =>
      dao.crear({
        usuarioId: extra.usuarioId ?? usuarioId,
        lugarId: extra.lugarId ?? lugarId,
        nivelSaturacion: nivel,
        fechaHora,
      });

    beforeEach(async () => {
      ({ dao, sembrador } = await crearEntorno());
      usuarioId = await sembrador.usuario();
      lugarId = await sembrador.lugar();
    });

    describe('crear / buscarPorId / actualizarEstado / actualizarConfiabilidad', () => {
      it('crea ACTIVO sin puntos ni confiabilidad y se recupera por id', async () => {
        const creado = await crear(NivelSaturacion.SATURADO, T0);
        expect(creado).toMatchObject({
          usuarioId,
          lugarId,
          nivelSaturacion: 'SATURADO',
          estado: 'ACTIVO',
          puntosOtorgados: 0,
          motivoSinPuntos: null,
          nivelConfiabilidad: null,
        });
        expect(creado.fechaHora).toEqual(T0);
        expect((await dao.buscarPorId(creado.id))?.id).toBe(creado.id);
        expect(await dao.buscarPorId(creado.id + 1000)).toBeNull();
      });

      it('actualizarEstado y actualizarConfiabilidad modifican la fila o devuelven null', async () => {
        const { id } = await crear(NivelSaturacion.TRANQUILO, T0);
        expect((await dao.actualizarEstado(id, EstadoReporte.ELIMINADO))?.estado).toBe('ELIMINADO');
        expect((await dao.actualizarConfiabilidad(id, 72.5))?.nivelConfiabilidad).toBe(72.5);
        expect(await dao.actualizarEstado(id + 1000, EstadoReporte.ELIMINADO)).toBeNull();
        expect(await dao.actualizarConfiabilidad(id + 1000, 10)).toBeNull();
      });
    });

    describe('buscarUltimoDeUsuarioEnLugar', () => {
      it('devuelve el mas reciente del par usuario+lugar, de cualquier estado', async () => {
        const otroLugar = await sembrador.lugar();
        const otroUsuario = await sembrador.usuario();
        const viejo = await crear(NivelSaturacion.TRANQUILO, T0);
        const nuevo = await crear(NivelSaturacion.SATURADO, desplazar(T0, 40));
        await dao.actualizarEstado(nuevo.id, EstadoReporte.ELIMINADO);
        await crear(NivelSaturacion.MODERADO, desplazar(T0, 90), { lugarId: otroLugar });
        await crear(NivelSaturacion.MODERADO, desplazar(T0, 95), { usuarioId: otroUsuario });
        expect((await dao.buscarUltimoDeUsuarioEnLugar(usuarioId, lugarId))?.id).toBe(nuevo.id);
        expect(viejo.id).not.toBe(nuevo.id);
        expect(await dao.buscarUltimoDeUsuarioEnLugar(otroUsuario, otroLugar)).toBeNull();
      });
    });

    describe('listarRecientesPorLugar / contarPorLugarDesde', () => {
      it('listar devuelve de cualquier estado desde la fecha (inclusiva), mas nuevo primero', async () => {
        const antes = await crear(NivelSaturacion.TRANQUILO, desplazar(T0, -61));
        const borde = await crear(NivelSaturacion.MODERADO, desplazar(T0, -60));
        const eliminado = await crear(NivelSaturacion.SATURADO, desplazar(T0, -10));
        await dao.actualizarEstado(eliminado.id, EstadoReporte.ELIMINADO);
        const recientes = await dao.listarRecientesPorLugar(lugarId, desplazar(T0, -60));
        expect(recientes.map((r) => r.id)).toEqual([eliminado.id, borde.id]);
        expect(recientes.map((r) => r.id)).not.toContain(antes.id);
      });

      it('contarPorLugarDesde cuenta solo ACTIVO del lugar', async () => {
        const otroLugar = await sembrador.lugar();
        await crear(NivelSaturacion.TRANQUILO, desplazar(T0, -5));
        const eliminado = await crear(NivelSaturacion.TRANQUILO, desplazar(T0, -4));
        await dao.actualizarEstado(eliminado.id, EstadoReporte.ELIMINADO);
        await crear(NivelSaturacion.TRANQUILO, desplazar(T0, -3), { lugarId: otroLugar });
        await crear(NivelSaturacion.TRANQUILO, desplazar(T0, -120));
        expect(await dao.contarPorLugarDesde(lugarId, desplazar(T0, -60))).toBe(1);
        expect(await dao.contarPorLugarDesde(otroLugar, desplazar(T0, -60))).toBe(1);
      });
    });

    describe('registrarPuntos / contarPremiadosDeUsuarioDesde', () => {
      it('cuenta solo reportes del usuario con puntos desde la fecha', async () => {
        const premiado = await crear(NivelSaturacion.TRANQUILO, T0);
        const sinPuntos = await crear(NivelSaturacion.TRANQUILO, desplazar(T0, 1));
        const viejo = await crear(NivelSaturacion.TRANQUILO, desplazar(T0, -1500));
        await dao.registrarPuntos(premiado.id, 10, null);
        await dao.registrarPuntos(sinPuntos.id, 0, MotivoSinPuntos.TOPE_DIARIO);
        await dao.registrarPuntos(viejo.id, 10, null);
        expect(await dao.contarPremiadosDeUsuarioDesde(usuarioId, desplazar(T0, -60))).toBe(1);
        expect(await dao.contarPremiadosDeUsuarioDesde(usuarioId, desplazar(T0, -2000))).toBe(2);
        expect((await dao.buscarPorId(sinPuntos.id))?.motivoSinPuntos).toBe('TOPE_DIARIO');
      });

      it('registrarPuntos devuelve null si el reporte no existe', async () => {
        expect(await dao.registrarPuntos(424242, 10, null)).toBeNull();
      });
    });

    describe('listarPorUsuario', () => {
      it('pagina solo los del usuario, mas nuevo primero, con totales', async () => {
        const otro = await sembrador.usuario();
        const a = await crear(NivelSaturacion.TRANQUILO, T0);
        const b = await crear(NivelSaturacion.MODERADO, desplazar(T0, 30));
        const c = await crear(NivelSaturacion.SATURADO, desplazar(T0, 60));
        await crear(NivelSaturacion.SATURADO, desplazar(T0, 70), { usuarioId: otro });
        const pagina1 = await dao.listarPorUsuario(usuarioId, { page: 1, size: 2 });
        expect(pagina1).toMatchObject({ page: 1, size: 2, total: 3, totalPaginas: 2 });
        expect(pagina1.items.map((r) => r.id)).toEqual([c.id, b.id]);
        expect((await dao.listarPorUsuario(usuarioId, { page: 2, size: 2 })).items.map((r) => r.id)).toEqual([a.id]);
        expect((await dao.listarPorUsuario(await sembrador.usuario(), { page: 1, size: 20 })).total).toBe(0);
      });
    });

    describe('agregarPorHora', () => {
      const consulta = (extra: Record<string, unknown> = {}) => ({
        lugarId,
        desde: new Date('2026-10-01T05:00:00Z'),
        hasta: new Date('2026-10-08T05:00:00Z'),
        dias: FiltroDias.TODOS,
        zonaHoraria: LIMA,
        ...extra,
      });

      it('agrupa por dia y hora de Lima con promedio 1/2/3 y solo ACTIVO', async () => {
        await crear(NivelSaturacion.MODERADO, T0); // 09:00 Lima
        await crear(NivelSaturacion.SATURADO, desplazar(T0, 20)); // 09:20
        await crear(NivelSaturacion.TRANQUILO, desplazar(T0, 300)); // 14:00
        const fuera = await crear(NivelSaturacion.SATURADO, desplazar(T0, 10));
        await dao.actualizarEstado(fuera.id, EstadoReporte.ELIMINADO);
        expect(await dao.agregarPorHora(consulta())).toEqual([
          { dia: '2026-10-05', hora: 9, promedio: 2.5, muestras: 2 },
          { dia: '2026-10-05', hora: 14, promedio: 1, muestras: 1 },
        ]);
      });

      it('respeta rango [desde, hasta), lugar y filtro de dias en zona Lima', async () => {
        await crear(NivelSaturacion.MODERADO, T0); // Monday
        await crear(NivelSaturacion.SATURADO, new Date('2026-10-03T20:00:00Z')); // Saturday 15:00
        await crear(NivelSaturacion.SATURADO, T0, { lugarId: await sembrador.lugar() });
        const laborables = await dao.agregarPorHora(consulta({ dias: FiltroDias.LABORABLES }));
        expect(laborables.map((a) => a.dia)).toEqual(['2026-10-05']);
        const finde = await dao.agregarPorHora(consulta({ dias: FiltroDias.FIN_DE_SEMANA }));
        expect(finde).toEqual([{ dia: '2026-10-03', hora: 15, promedio: 3, muestras: 1 }]);
        const hastaExclusivo = await dao.agregarPorHora(consulta({ hasta: T0 }));
        expect(hastaExclusivo.map((a) => a.dia)).toEqual(['2026-10-03']);
      });
    });

    describe('hayReportesSinteticos', () => {
      const ventana = (extra: Record<string, unknown> = {}) => ({
        lugarId,
        desde: new Date('2026-10-01T05:00:00Z'),
        hasta: new Date('2026-10-08T05:00:00Z'),
        dias: FiltroDias.TODOS,
        zonaHoraria: LIMA,
        ...extra,
      });

      it('es falso con reportes de usuarios reales y verdadero en cuanto uno es sintetico', async () => {
        await crear(NivelSaturacion.MODERADO, T0);
        expect(await dao.hayReportesSinteticos(ventana())).toBe(false);
        await crear(NivelSaturacion.SATURADO, desplazar(T0, 5), { usuarioId: await sembrador.usuarioSintetico() });
        expect(await dao.hayReportesSinteticos(ventana())).toBe(true);
      });

      it('solo cuenta el lugar, el rango [desde, hasta), los ACTIVO y el filtro de dias de la consulta', async () => {
        const sintetico = await sembrador.usuarioSintetico();
        const otroLugar = await sembrador.lugar();
        await crear(NivelSaturacion.MODERADO, T0, { usuarioId: sintetico, lugarId: otroLugar });
        expect(await dao.hayReportesSinteticos(ventana())).toBe(false);
        const eliminado = await crear(NivelSaturacion.MODERADO, T0, { usuarioId: sintetico });
        await dao.actualizarEstado(eliminado.id, EstadoReporte.ELIMINADO);
        expect(await dao.hayReportesSinteticos(ventana())).toBe(false);
        await crear(NivelSaturacion.MODERADO, T0, { usuarioId: sintetico }); // Monday
        expect(await dao.hayReportesSinteticos(ventana({ hasta: T0 }))).toBe(false);
        expect(await dao.hayReportesSinteticos(ventana({ dias: FiltroDias.FIN_DE_SEMANA }))).toBe(false);
        expect(await dao.hayReportesSinteticos(ventana({ dias: FiltroDias.LABORABLES }))).toBe(true);
      });
    });

    describe('listarPendientesDeValidar', () => {
      it('excluye propios, eliminados, anteriores a desde y lugares fuera de lugarIds', async () => {
        const otro = await sembrador.usuario();
        const otroLugar = await sembrador.lugar();
        const ajeno = await crear(NivelSaturacion.MODERADO, desplazar(T0, -30), { usuarioId: otro });
        const ajenoOtroLugar = await crear(NivelSaturacion.MODERADO, desplazar(T0, -20), {
          usuarioId: otro,
          lugarId: otroLugar,
        });
        await crear(NivelSaturacion.MODERADO, desplazar(T0, -25)); // own
        await crear(NivelSaturacion.MODERADO, desplazar(T0, -400), { usuarioId: otro }); // too old
        const eliminado = await crear(NivelSaturacion.MODERADO, desplazar(T0, -10), { usuarioId: otro });
        await dao.actualizarEstado(eliminado.id, EstadoReporte.ELIMINADO);
        const desde = desplazar(T0, -180);
        // Scoped to this test's places: the database is shared by every case, so rows of earlier cases exist.
        const todos = await dao.listarPendientesDeValidar(
          { usuarioId, desde, lugarIds: [lugarId, otroLugar] },
          { page: 1, size: 20 },
        );
        expect(todos.items.map((r) => r.id)).toEqual([ajenoOtroLugar.id, ajeno.id]);
        const soloLugar = await dao.listarPendientesDeValidar(
          { usuarioId, desde, lugarIds: [lugarId] },
          { page: 1, size: 20 },
        );
        expect(soloLugar.items.map((r) => r.id)).toEqual([ajeno.id]);
        expect(soloLugar.total).toBe(1);
      });
    });

    it('listarPendientesDeValidar omite los reportes de excluirIds (los que ya voto)', async () => {
      const otro = await sembrador.usuario();
      const votado = await crear(NivelSaturacion.MODERADO, desplazar(T0, -30), { usuarioId: otro });
      const pendiente = await crear(NivelSaturacion.MODERADO, desplazar(T0, -20), { usuarioId: otro });
      const pagina = await dao.listarPendientesDeValidar(
        { usuarioId, desde: desplazar(T0, -180), lugarIds: [lugarId], excluirIds: [votado.id] },
        { page: 1, size: 20 },
      );
      expect(pagina.items.map((r) => r.id)).toEqual([pendiente.id]);
      expect(pagina.total).toBe(1);
    });

    it('crear con usuario o lugar inexistente lanza ForeignKeyConstraintError', async () => {
      await expect(crear(NivelSaturacion.MODERADO, T0, { usuarioId: ID_INEXISTENTE })).rejects.toBeInstanceOf(
        ForeignKeyConstraintError,
      );
      await expect(crear(NivelSaturacion.MODERADO, T0, { lugarId: ID_INEXISTENTE })).rejects.toBeInstanceOf(
        ForeignKeyConstraintError,
      );
    });

    casosPaginacion('listarPorUsuario', async () => {
      await crear(NivelSaturacion.MODERADO, T0);
      await crear(NivelSaturacion.MODERADO, T0);
      await crear(NivelSaturacion.MODERADO, T0);
      return (paginacion) => dao.listarPorUsuario(usuarioId, paginacion);
    });
  });
}
