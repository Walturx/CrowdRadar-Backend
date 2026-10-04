/**
 * Observer contract (design 6, ADR 13): subscribers run in subscription order, after the
 * commit, and one subscriber failing never breaks the publish or the other subscribers.
 */
import { describe, expect, it } from 'vitest';
import { PublicadorSaturacion } from '../../../src/pattern/observer/PublicadorSaturacion.js';
import type { SaturacionObserver } from '../../../src/pattern/observer/SaturacionObserver.js';
import { crearEventoSaturacion } from '../../../src/pattern/observer/SaturacionCambiadaEvento.js';
import { crearLoggerEspia } from '../../support/LoggerEspia.js';

const AHORA = new Date('2026-10-05T14:00:00Z');
const evento = crearEventoSaturacion({ lugarId: 7, nivelAnterior: 'MODERADO', nivelNuevo: 'SATURADO', autorId: 3, ocurridoEn: AHORA });

function observador(nombre: string, accion: (e: unknown) => void | Promise<void> = () => {}): SaturacionObserver & { recibidos: unknown[] } {
  const recibidos: unknown[] = [];
  return {
    nombre,
    recibidos,
    async alRecibir(e) {
      recibidos.push(e);
      await accion(e);
    },
  };
}

describe('SaturacionCambiadaEvento', () => {
  it('lleva lugar, niveles, autor y la hora, y se identifica por tipo', () => {
    expect(evento).toEqual({
      tipo: 'SATURACION_CAMBIADA',
      ocurridoEn: AHORA,
      lugarId: 7,
      nivelAnterior: 'MODERADO',
      nivelNuevo: 'SATURADO',
      autorId: 3,
    });
  });

  it('admite nivelAnterior y nivelNuevo null (primer nivel conocido o lectura vencida)', () => {
    const primero = crearEventoSaturacion({ lugarId: 1, nivelAnterior: null, nivelNuevo: 'TRANQUILO', autorId: 2, ocurridoEn: AHORA });
    expect(primero.nivelAnterior).toBeNull();
    const vencido = crearEventoSaturacion({ lugarId: 1, nivelAnterior: 'SATURADO', nivelNuevo: null, autorId: 2, ocurridoEn: AHORA });
    expect(vencido.nivelNuevo).toBeNull();
  });
});

describe('PublicadorSaturacion', () => {
  it('entrega el mismo evento a cada suscriptor, en el orden de suscripcion', async () => {
    const orden: string[] = [];
    const publicador = new PublicadorSaturacion(crearLoggerEspia().logger);
    const primero = observador('primero', () => void orden.push('primero'));
    const segundo = observador('segundo', () => void orden.push('segundo'));
    publicador.suscribir(primero);
    publicador.suscribir(segundo);
    await publicador.notificar(evento);
    expect(orden).toEqual(['primero', 'segundo']);
    expect(primero.recibidos).toEqual([evento]);
    expect(segundo.recibidos).toEqual([evento]);
  });

  it('un suscriptor que lanza no rompe la publicacion: el siguiente corre y el error se registra', async () => {
    const { logger, lineas } = crearLoggerEspia();
    const publicador = new PublicadorSaturacion(logger);
    const roto = observador('alerta-favoritos', () => {
      throw new Error('FCM caido');
    });
    const sano = observador('auditoria');
    publicador.suscribir(roto);
    publicador.suscribir(sano);

    await expect(publicador.notificar(evento)).resolves.toBeUndefined();

    expect(sano.recibidos).toEqual([evento]);
    const error = lineas.find((l) => l.level === 50);
    expect(error).toMatchObject({ suscriptor: 'alerta-favoritos', tipoEvento: 'SATURACION_CAMBIADA', lugarId: 7 });
    expect(error?.msg).toBe('Fallo un suscriptor de eventos; se ignora');
    expect((error?.err as { message: string }).message).toBe('FCM caido');
  });

  it('una promesa rechazada se aisla igual que una excepcion sincrona', async () => {
    const { logger, lineas } = crearLoggerEspia();
    const publicador = new PublicadorSaturacion(logger);
    publicador.suscribir({ nombre: 'async-roto', alRecibir: () => Promise.reject(new Error('rechazado')) });
    const sano = observador('sano');
    publicador.suscribir(sano);
    await publicador.notificar(evento);
    expect(sano.recibidos).toHaveLength(1);
    expect(lineas.filter((l) => l.level === 50)).toHaveLength(1);
  });

  it('sin suscriptores notificar resuelve sin hacer nada; no se registran errores', async () => {
    const { logger, lineas } = crearLoggerEspia();
    await new PublicadorSaturacion(logger).notificar(evento);
    expect(lineas.filter((l) => l.level === 50)).toEqual([]);
  });

  it('suscribir el mismo observador dos veces lo entrega una sola vez', async () => {
    const publicador = new PublicadorSaturacion(crearLoggerEspia().logger);
    const unico = observador('unico');
    publicador.suscribir(unico);
    publicador.suscribir(unico);
    await publicador.notificar(evento);
    expect(unico.recibidos).toEqual([evento]);
  });

  it('un suscriptor que suscribe a otro durante la notificacion no altera la ronda en curso', async () => {
    const publicador = new PublicadorSaturacion(crearLoggerEspia().logger);
    const tardio = observador('tardio');
    const sembrador = observador('sembrador', () => publicador.suscribir(tardio));
    publicador.suscribir(sembrador);
    await publicador.notificar(evento);
    expect(tardio.recibidos).toEqual([]);
    await publicador.notificar(evento);
    expect(tardio.recibidos).toEqual([evento]);
  });

  it('espera a cada suscriptor antes de llamar al siguiente (un suscriptor lento retiene a los demas)', async () => {
    const orden: string[] = [];
    const publicador = new PublicadorSaturacion(crearLoggerEspia().logger);
    publicador.suscribir(
      observador('lento', async () => {
        orden.push('lento:inicio');
        await new Promise((resolver) => setTimeout(resolver, 20));
        orden.push('lento:fin');
      }),
    );
    publicador.suscribir(observador('rapido', () => void orden.push('rapido')));
    await publicador.notificar(evento);
    expect(orden).toEqual(['lento:inicio', 'lento:fin', 'rapido']);
  });
});
