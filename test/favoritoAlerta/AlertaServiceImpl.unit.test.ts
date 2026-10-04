/**
 * Integrante: stream M3 (favoritos y alertas)
 * Tecnica: caja negra (particiones de equivalencia: alerta propia, ajena, inexistente, ya leida)
 * Metodo: AlertaServiceImpl.listar / marcarLeida / contarNoLeidas (spec M3 R6, S22-S24)
 */
import { describe, expect, it } from 'vitest';
import type { NuevaAlerta } from '../../src/dao/AlertaDAO.js';
import { NivelSaturacion } from '../../src/enum/NivelSaturacion.js';
import { AlertaNoEncontradaException } from '../../src/exception/alerta/AlertaNoEncontradaException.js';
import { CodigoError } from '../../src/exception/CodigoError.js';
import { AlertaServiceImpl } from '../../src/service/impl/AlertaServiceImpl.js';
import { AlertaDAOMemoria } from '../support/dao/memoria/AlertaDAOMemoria.js';

const T0 = new Date('2026-10-05T14:00:00Z');
const minutos = (n: number) => new Date(T0.getTime() + n * 60_000);
const NOMBRES = new Map([
  [7, 'Parque Kennedy'],
  [8, 'Plaza de Armas'],
]);

function armar() {
  const alertaDAO = new AlertaDAOMemoria();
  const service = new AlertaServiceImpl({
    alertaDAO,
    nombresLugar: async (ids) => new Map(ids.flatMap((id) => (NOMBRES.has(id) ? [[id, NOMBRES.get(id)!] as const] : []))),
  });
  const alertar = (usuarioId: number, fechaHora: Date, lugarId = 7, extra: Partial<NuevaAlerta> = {}) =>
    alertaDAO.crear({
      favoritoId: 1,
      usuarioId,
      lugarId,
      nivelAnterior: NivelSaturacion.MODERADO,
      nivelNuevo: NivelSaturacion.SATURADO,
      mensaje: 'Cambio de saturacion',
      fechaHora,
      ...extra,
    });
  return { service, alertaDAO, alertar };
}

describe('AlertaServiceImpl.listar', () => {
  it('devuelve las alertas del usuario, la mas nueva primero, con el nombre del lugar y noLeidas', async () => {
    const { service, alertar } = armar();
    const a = await alertar(1, T0, 7);
    const b = await alertar(1, minutos(5), 8);
    await alertar(2, minutos(9), 7);
    const { pagina, noLeidas } = await service.listar(1, { page: 1, size: 20 });
    expect(pagina.items.map((i) => [i.alerta.id, i.lugarNombre])).toEqual([
      [b.id, 'Plaza de Armas'],
      [a.id, 'Parque Kennedy'],
    ]);
    expect(pagina).toMatchObject({ page: 1, size: 20, total: 2, totalPaginas: 1 });
    expect(noLeidas).toBe(2);
  });

  it('noLeidas cuenta todas las no leidas del usuario, no solo las de la pagina', async () => {
    const { service, alertar } = armar();
    for (let i = 0; i < 3; i += 1) await alertar(1, minutos(i));
    const { pagina, noLeidas } = await service.listar(1, { page: 1, size: 2 });
    expect(pagina.items).toHaveLength(2);
    expect(noLeidas).toBe(3);
  });

  it('con 2 no leidas y 1 leida informa noLeidas = 2 (S22) y baja a 1 al marcar una (S23)', async () => {
    const { service, alertar } = armar();
    const primera = await alertar(1, T0);
    await alertar(1, minutos(1));
    const leida = await alertar(1, minutos(2));
    await service.marcarLeida(1, leida.id);
    expect((await service.listar(1, { page: 1, size: 20 })).noLeidas).toBe(2);
    await service.marcarLeida(1, primera.id);
    expect((await service.listar(1, { page: 1, size: 20 })).noLeidas).toBe(1);
  });

  it('un lugar cuyo nombre no se resuelve se lista con nombre vacio', async () => {
    const { service, alertar } = armar();
    await alertar(1, T0, 999);
    const { pagina } = await service.listar(1, { page: 1, size: 20 });
    expect(pagina.items.map((i) => i.lugarNombre)).toEqual(['']);
  });

  it('sin alertas: pagina vacia con total 0 y noLeidas 0 (la pagina vacia proviene de un usuario sin filas)', async () => {
    const { service, alertar } = armar();
    await alertar(2, T0);
    const resultado = await service.listar(1, { page: 1, size: 20 });
    expect(resultado.pagina).toMatchObject({ items: [], total: 0, totalPaginas: 0 });
    expect(resultado.noLeidas).toBe(0);
  });
});

describe('AlertaServiceImpl.marcarLeida', () => {
  it('marca la alerta propia como leida y devuelve el nombre del lugar', async () => {
    const { service, alertar } = armar();
    const alerta = await alertar(1, T0, 8);
    const resultado = await service.marcarLeida(1, alerta.id);
    expect(resultado.alerta).toMatchObject({ id: alerta.id, leida: true });
    expect(resultado.lugarNombre).toBe('Plaza de Armas');
  });

  it('es idempotente: marcar dos veces responde igual y no cambia el contador', async () => {
    const { service, alertar } = armar();
    const alerta = await alertar(1, T0);
    await alertar(1, minutos(1));
    await service.marcarLeida(1, alerta.id);
    const repetida = await service.marcarLeida(1, alerta.id);
    expect(repetida.alerta.leida).toBe(true);
    expect(await service.contarNoLeidas(1)).toBe(1);
  });

  it.each([
    ['ajena', async (alertar: ReturnType<typeof armar>['alertar']) => (await alertar(2, T0)).id],
    ['inexistente', async () => 4242],
  ])('una alerta %s lanza AlertaNoEncontradaException (404) sin revelar su existencia (S24)', async (_caso, crearId) => {
    const { service, alertar } = armar();
    const id = await crearId(alertar);
    const error = await service.marcarLeida(1, id).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AlertaNoEncontradaException);
    expect(error).toMatchObject({ status: 404, code: CodigoError.ALERTA_NO_ENCONTRADA });
  });

  it('marcar la alerta ajena no la marca para su duenio', async () => {
    const { service, alertar } = armar();
    const ajena = await alertar(2, T0);
    await service.marcarLeida(1, ajena.id).catch(() => undefined);
    expect(await service.contarNoLeidas(2)).toBe(1);
  });
});

describe('AlertaServiceImpl.contarNoLeidas', () => {
  it('cuenta solo las no leidas del usuario', async () => {
    const { service, alertar } = armar();
    await alertar(1, T0);
    await alertar(1, minutos(1));
    await alertar(2, minutos(2));
    expect(await service.contarNoLeidas(1)).toBe(2);
    expect(await service.contarNoLeidas(2)).toBe(1);
    expect(await service.contarNoLeidas(3)).toBe(0);
  });
});
