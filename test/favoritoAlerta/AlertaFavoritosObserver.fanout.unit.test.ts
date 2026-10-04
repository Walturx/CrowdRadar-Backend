/**
 * Fan-out of AlertaFavoritosObserver (spec M3 R5): followers are served with bounded concurrency
 * (ALERTAS_CONCURRENCIA), a push that hangs is cut after PUSH_TIMEOUT_MS without blocking the others, and a
 * failing token cleanup is told apart from a failing provider.
 */
import { describe, expect, it } from 'vitest';
import type { NotificadorPush, ResultadoPush } from '../../src/adapter/push/NotificadorPush.js';
import { NivelSaturacion } from '../../src/enum/NivelSaturacion.js';
import { PlataformaPush } from '../../src/enum/PlataformaPush.js';
import { AlertaFavoritosObserver } from '../../src/pattern/observer/AlertaFavoritosObserver.js';
import { crearEventoSaturacion } from '../../src/pattern/observer/SaturacionCambiadaEvento.js';
import { AlertaDAOMemoria } from '../support/dao/memoria/AlertaDAOMemoria.js';
import { DispositivoDAOMemoria } from '../support/dao/memoria/DispositivoDAOMemoria.js';
import { FavoritoDAOMemoria } from '../support/dao/memoria/FavoritoDAOMemoria.js';
import { crearLoggerEspia } from '../support/LoggerEspia.js';

const LUGAR = 7;
const evento = crearEventoSaturacion({
  ocurridoEn: new Date('2026-10-05T15:00:00Z'),
  lugarId: LUGAR,
  nivelAnterior: NivelSaturacion.MODERADO,
  nivelNuevo: NivelSaturacion.SATURADO,
  autorId: 999,
});
const pausa = (ms: number) => new Promise<void>((resolver) => setTimeout(resolver, ms));

/** Push provider that measures how many sends overlap. */
function notificadorMedidor(demoraMs: number) {
  let activos = 0;
  const estado = { maximo: 0, enviados: [] as string[] };
  const notificador: NotificadorPush = {
    async enviar(tokens): Promise<ResultadoPush> {
      activos += 1;
      estado.maximo = Math.max(estado.maximo, activos);
      await pausa(demoraMs);
      activos -= 1;
      estado.enviados.push(...tokens);
      return { enviados: tokens.length, tokensInvalidos: [] };
    },
  };
  return { notificador, estado };
}

async function armar(
  seguidores: number,
  notificador: NotificadorPush,
  extra: { concurrencia?: number; pushTimeoutMs?: number } = {},
) {
  const alertas = new AlertaDAOMemoria();
  const favoritos = new FavoritoDAOMemoria({ alertas });
  const dispositivos = new DispositivoDAOMemoria();
  for (let usuario = 1; usuario <= seguidores; usuario++) {
    await favoritos.crear(usuario, LUGAR);
    await dispositivos.registrar(usuario, `tok-${usuario}`, PlataformaPush.ANDROID);
  }
  const espia = crearLoggerEspia();
  const observer = new AlertaFavoritosObserver({
    favoritoDAO: favoritos,
    alertaDAO: alertas,
    dispositivoDAO: dispositivos,
    notificador,
    nombresLugar: async (ids) => new Map(ids.map((id) => [id, 'Parque Kennedy'])),
    logger: espia.logger,
    ...extra,
  });
  return { observer, alertas, dispositivos, lineas: espia.lineas };
}

describe('AlertaFavoritosObserver: fan-out acotado', () => {
  it('con concurrencia 3 nunca hay mas de 3 envios a la vez y los 10 seguidores reciben su alerta', async () => {
    const { notificador, estado } = notificadorMedidor(10);
    const t = await armar(10, notificador, { concurrencia: 3 });
    await t.observer.alCambiarSaturacion(evento);
    expect(estado.maximo).toBe(3);
    expect(estado.enviados).toHaveLength(10);
    for (let usuario = 1; usuario <= 10; usuario++) expect(await t.alertas.contarNoLeidas(usuario)).toBe(1);
  });

  it('con concurrencia 1 se atiende de a uno', async () => {
    const { notificador, estado } = notificadorMedidor(5);
    const t = await armar(4, notificador, { concurrencia: 1 });
    await t.observer.alCambiarSaturacion(evento);
    expect(estado.maximo).toBe(1);
    expect(estado.enviados).toHaveLength(4);
  });

  it('por defecto la concurrencia es 5', async () => {
    const { notificador, estado } = notificadorMedidor(10);
    const t = await armar(12, notificador);
    await t.observer.alCambiarSaturacion(evento);
    expect(estado.maximo).toBe(5);
    expect(estado.enviados).toHaveLength(12);
  });
});

describe('AlertaFavoritosObserver: tiempo limite del push', () => {
  it('un push colgado se corta: su alerta queda, se registra y los demas seguidores son atendidos', async () => {
    const enviados: string[] = [];
    const notificador: NotificadorPush = {
      async enviar(tokens): Promise<ResultadoPush> {
        if (tokens.includes('tok-1')) return new Promise<ResultadoPush>(() => undefined);
        enviados.push(...tokens);
        return { enviados: tokens.length, tokensInvalidos: [] };
      },
    };
    const t = await armar(3, notificador, { pushTimeoutMs: 30, concurrencia: 1 });
    const inicio = Date.now();
    await t.observer.alCambiarSaturacion(evento);
    expect(Date.now() - inicio).toBeLessThan(500);
    expect([...enviados].sort()).toEqual(['tok-2', 'tok-3']);
    expect(await t.alertas.contarNoLeidas(1)).toBe(1);
    const error = t.lineas.find((l) => l.level === 50);
    expect(error).toMatchObject({ usuarioId: 1, lugarId: LUGAR, msg: 'El proveedor de push fallo o agoto el tiempo; la alerta queda guardada' });
    expect((error?.err as { message: string }).message).toContain('30');
  });

  it('un push que responde dentro del limite no registra errores', async () => {
    const { notificador, estado } = notificadorMedidor(5);
    const t = await armar(2, notificador, { pushTimeoutMs: 200 });
    await t.observer.alCambiarSaturacion(evento);
    expect([...estado.enviados].sort()).toEqual(['tok-1', 'tok-2']);
    expect(t.lineas.filter((l) => l.level === 50)).toEqual([]);
  });
});

describe('AlertaFavoritosObserver: limpieza de tokens', () => {
  it('si borrar los tokens invalidos falla, se registra con su propio mensaje y la alerta no se pierde', async () => {
    const notificador: NotificadorPush = {
      async enviar(tokens): Promise<ResultadoPush> {
        return { enviados: 0, tokensInvalidos: [...tokens] };
      },
    };
    const t = await armar(1, notificador);
    t.dispositivos.eliminarTokens = async () => {
      throw new Error('bd caida');
    };
    await t.observer.alCambiarSaturacion(evento);
    expect(await t.alertas.contarNoLeidas(1)).toBe(1);
    const errores = t.lineas.filter((l) => l.level === 50);
    expect(errores).toHaveLength(1);
    expect(errores[0]?.msg).toBe('No se pudieron borrar los tokens invalidos de push');
  });

  it('si el proveedor falla no se intenta limpiar y el mensaje es el del proveedor', async () => {
    const notificador: NotificadorPush = {
      async enviar(): Promise<ResultadoPush> {
        throw new Error('FCM caido');
      },
    };
    const t = await armar(1, notificador);
    await t.observer.alCambiarSaturacion(evento);
    expect(t.lineas.filter((l) => l.level === 50).map((l) => l.msg)).toEqual([
      'El proveedor de push fallo o agoto el tiempo; la alerta queda guardada',
    ]);
  });
});
