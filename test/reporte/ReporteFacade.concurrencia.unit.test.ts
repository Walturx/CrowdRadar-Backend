/**
 * Concurrency of ReporteFacadeImpl.registrar (spec M4 R3, S6): two simultaneous reports of the same user and place
 * end as one success and one 422, never two rows. The in-memory DAO emulates pg_advisory_xact_lock; the same
 * flow against PostgreSQL lives in ReporteFacade.concurrencia.db.test.ts (opt-in with DATABASE_URL_TEST).
 */
import { describe, expect, it } from 'vitest';
import { NivelSaturacion } from '../../src/enum/NivelSaturacion.js';
import { CodigoError } from '../../src/exception/CodigoError.js';
import { armarFacadeConMemoria } from '../support/reporte/armarFacade.js';

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
});
