/**
 * Concurrency of ReporteFacadeImpl.registrar (spec M4 R3, S6): two simultaneous reports of the same user and place
 * end as one success and one 422, never two rows. The in-memory DAO emulates pg_advisory_xact_lock; the same
 * flow against PostgreSQL lives in ReporteFacade.concurrencia.db.test.ts (opt-in with DATABASE_URL_TEST).
 */
import { describe, expect, it } from 'vitest';
import { NivelSaturacion } from '../../src/enum/NivelSaturacion.js';
import { CodigoError } from '../../src/exception/CodigoError.js';
import type { SaturacionCambiadaEvento } from '../../src/pattern/observer/SaturacionCambiadaEvento.js';
import { armarFacadeConMemoria } from '../support/reporte/armarFacade.js';

/** Subject that keeps every published event, in publish order. */
function sujetoGrabador() {
  const eventos: SaturacionCambiadaEvento[] = [];
  return { eventos, suscribir: () => {}, notificar: async (e: SaturacionCambiadaEvento) => void eventos.push(e) };
}

describe('ReporteFacadeImpl.registrar: concurrencia', () => {
  it('dos registrar simultaneos del mismo usuario y lugar: uno 201 y otro 422, una sola fila', async () => {
    const { facade, usuarioId, lugarId, reporteDAO } = await armarFacadeConMemoria({ insercionLenta: true });
    const resultados = await Promise.allSettled([
      facade.registrar(usuarioId, lugarId, NivelSaturacion.MODERADO),
      facade.registrar(usuarioId, lugarId, NivelSaturacion.SATURADO),
    ]);
    expect(resultados.map((r) => r.status).sort()).toEqual(['fulfilled', 'rejected']);
    const rechazado = resultados.find((r): r is PromiseRejectedResult => r.status === 'rejected');
    expect(rechazado?.reason).toMatchObject({ status: 422, code: CodigoError.REPORTE_EN_ESPERA });
    expect((await reporteDAO.listarPorUsuario(usuarioId, { page: 1, size: 10 })).total).toBe(1);
  });

  it('usuarios distintos sobre el mismo lugar no se bloquean: ambos reportan', async () => {
    const { facade, usuarioId, otroUsuarioId, lugarId, reporteDAO } = await armarFacadeConMemoria({ insercionLenta: true });
    const resultados = await Promise.allSettled([
      facade.registrar(usuarioId, lugarId, NivelSaturacion.MODERADO),
      facade.registrar(otroUsuarioId, lugarId, NivelSaturacion.MODERADO),
    ]);
    expect(resultados.map((r) => r.status)).toEqual(['fulfilled', 'fulfilled']);
    expect((await reporteDAO.listarRecientesPorLugar(lugarId, new Date(0))).length).toBe(2);
  });

  it('usuarios distintos sobre el mismo lugar: la saturacion final y los eventos reflejan a los dos (lock por lugar)', async () => {
    const subject = sujetoGrabador();
    const { facade, usuarioId, otroUsuarioId, lugarId, lugarDAO } = await armarFacadeConMemoria({
      insercionLenta: true,
      saturacionLenta: true,
      subject,
    });
    await Promise.all([
      facade.registrar(usuarioId, lugarId, NivelSaturacion.SATURADO),
      facade.registrar(otroUsuarioId, lugarId, NivelSaturacion.TRANQUILO),
    ]);
    // Serialized per place: one event goes from "unknown" and the other continues from where the first one left.
    expect(subject.eventos).toHaveLength(2);
    const primero = subject.eventos.find((e) => e.nivelAnterior === null);
    const segundo = subject.eventos.find((e) => e !== primero);
    expect(primero).toBeDefined();
    expect(segundo?.nivelAnterior).toBe(primero?.nivelNuevo);
    expect((await lugarDAO.buscarPorId(lugarId))?.saturacionActual).toBe(segundo?.nivelNuevo);
  });

  it('el lock por lugar no frena a lugares distintos: dos usuarios en lugares distintos terminan con un evento cada uno', async () => {
    const subject = sujetoGrabador();
    const { facade, usuarioId, otroUsuarioId, lugarId, lugarDAO } = await armarFacadeConMemoria({
      insercionLenta: true,
      saturacionLenta: true,
      subject,
    });
    const otroLugarId = lugarDAO.agregar({ id: lugarId + 1 }).id;
    await Promise.all([
      facade.registrar(usuarioId, lugarId, NivelSaturacion.SATURADO),
      facade.registrar(otroUsuarioId, otroLugarId, NivelSaturacion.TRANQUILO),
    ]);
    expect(subject.eventos.map((e) => [e.lugarId, e.nivelAnterior, e.nivelNuevo]).sort()).toEqual([
      [lugarId, null, 'SATURADO'],
      [otroLugarId, null, 'TRANQUILO'],
    ]);
  });

  it('un usuario reportando en varios lugares a la vez no supera el tope diario de karma (lock por usuario)', async () => {
    const { facade, usuarioId, lugarId, lugarDAO, reporteDAO, usuarioDAO } = await armarFacadeConMemoria({ insercionLenta: true });
    const lugarIds = [lugarId, ...Array.from({ length: 7 }, (_, i) => lugarDAO.agregar({ id: lugarId + 1 + i }).id)];
    const resultados = await Promise.all(lugarIds.map((id) => facade.registrar(usuarioId, id, NivelSaturacion.MODERADO)));
    expect(resultados.filter((r) => r.karma.puntosGanados > 0)).toHaveLength(5);
    expect(resultados.filter((r) => r.karma.motivoSinPuntos === 'TOPE_DIARIO')).toHaveLength(3);
    expect(await reporteDAO.contarPremiadosDeUsuarioDesde(usuarioId, new Date(0))).toBe(5);
    expect((await usuarioDAO.buscarPorId(usuarioId))?.puntosKarma).toBe(50);
  });
});
