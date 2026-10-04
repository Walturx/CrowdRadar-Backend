/**
 * Composition of the M3 stream: the observer is subscribed to the shared subject, so a published level change
 * reaches the favourites of the place (spec M3 R5, S15, S17, S21), and the whole chain is exercised through
 * POST /api/reportes: an observer that explodes never turns the 201 into an error.
 */
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import type { NotificadorPush } from '../../src/adapter/push/NotificadorPush.js';
import { createApp } from '../../src/app.js';
import { construirFavoritoAlerta, crearDaosFavoritoAlertaSequelize } from '../../src/container/favoritoAlerta.js';
import { construirInfraestructura } from '../../src/container/infraestructura.js';
import { PlataformaPush } from '../../src/enum/PlataformaPush.js';
import { NivelSaturacion } from '../../src/enum/NivelSaturacion.js';
import type { SaturacionObserver } from '../../src/pattern/observer/SaturacionObserver.js';
import { crearEventoSaturacion } from '../../src/pattern/observer/SaturacionCambiadaEvento.js';
import { PublicadorSaturacion } from '../../src/pattern/observer/PublicadorSaturacion.js';
import { configPrueba, type SobrescritosEntorno } from '../support/configPrueba.js';
import { crearContenedorPrueba } from '../support/crearContenedorPrueba.js';
import { LugarDAOMemoria } from '../support/dao/memoria/LugarDAOMemoria.js';
import { crearLoggerEspia } from '../support/LoggerEspia.js';
import { aUsuario } from '../support/fabrica/datos.js';

const LUGAR = 7;
const evento = () =>
  crearEventoSaturacion({
    ocurridoEn: new Date('2026-10-05T15:00:00Z'),
    lugarId: LUGAR,
    nivelAnterior: NivelSaturacion.MODERADO,
    nivelNuevo: NivelSaturacion.SATURADO,
    autorId: 99,
  });

function armar(cfg: SobrescritosEntorno = {}, conEspia = true, notificador?: NotificadorPush) {
  const ctx = crearContenedorPrueba();
  const { logger, lineas } = crearLoggerEspia();
  const subject = new PublicadorSaturacion(logger);
  const infra = construirInfraestructura({
    cfg: configPrueba(cfg),
    logger,
    conexion: ctx.conexion,
    usuarioDAO: ctx.usuarioDAO,
    lugarDAO: ctx.lugarDAO,
    reporteDAO: ctx.reporteDAO,
    hasher: ctx.hasher,
    emisorToken: ctx.emisorToken,
    subject,
  });
  const daos = conEspia ? ctx.favoritoAlerta : { ...ctx.favoritoAlerta, notificador: undefined };
  construirFavoritoAlerta(infra, notificador ? { ...daos, notificador } : daos);
  return { ctx, subject, lineas };
}

describe('container/favoritoAlerta', () => {
  it('suscribe el observer al sujeto compartido: un cambio publicado genera la alerta y el push del seguidor', async () => {
    const { ctx, subject } = armar();
    ctx.lugarDAO.agregar({ id: LUGAR, nombre: 'Parque Kennedy' });
    await ctx.favoritoDAO.crear(1, LUGAR);
    await ctx.dispositivoDAO.registrar(1, 'tok-1', PlataformaPush.ANDROID);
    await subject.notificar(evento());
    expect(await ctx.alertaDAO.contarNoLeidas(1)).toBe(1);
    expect(ctx.notificador.llamadas.map((l) => l.tokens)).toEqual([['tok-1']]);
  });

  it('un suscriptor que explota antes que el observer no impide la alerta ni rechaza el publish (S21)', async () => {
    const { ctx, subject, lineas } = armar();
    subject.suscribir({
      nombre: 'explosivo',
      alRecibir: () => {
        throw new Error('boom');
      },
    });
    ctx.lugarDAO.agregar({ id: LUGAR });
    await ctx.favoritoDAO.crear(1, LUGAR);
    await expect(subject.notificar(evento())).resolves.toBeUndefined();
    expect(await ctx.alertaDAO.contarNoLeidas(1)).toBe(1);
    expect(lineas.some((l) => l.suscriptor === 'explosivo')).toBe(true);
  });

  it('sin seguidores el publish no crea alertas ni llama al proveedor de push', async () => {
    const { ctx, subject } = armar();
    ctx.lugarDAO.agregar({ id: LUGAR });
    await ctx.favoritoDAO.crear(1, LUGAR + 1);
    await subject.notificar(evento());
    expect(await ctx.alertaDAO.contarNoLeidas(1)).toBe(0);
    expect(ctx.notificador.llamadas).toHaveLength(0);
  });

  it('con PUSH_PROVEEDOR=fcm sin cliente Firebase el push falla aislado: la alerta queda y se registra el error', async () => {
    const { ctx, subject, lineas } = armar({ PUSH_PROVEEDOR: 'fcm', FCM_CREDENCIALES_RUTA: './cred.json' }, false);
    ctx.lugarDAO.agregar({ id: LUGAR });
    await ctx.favoritoDAO.crear(1, LUGAR);
    await ctx.dispositivoDAO.registrar(1, 'tok-1', PlataformaPush.ANDROID);
    await expect(subject.notificar(evento())).resolves.toBeUndefined();
    expect(await ctx.alertaDAO.contarNoLeidas(1)).toBe(1);
    expect(lineas.some((l) => l.level === 50 && String(l.msg).includes('proveedor de push'))).toBe(true);
    expect(JSON.stringify(lineas)).not.toContain('tok-1');
  });

  it('ALERTAS_CONCURRENCIA y PUSH_TIMEOUT_MS de la configuracion llegan al observer: un push colgado se corta', async () => {
    const colgado: NotificadorPush = { enviar: () => new Promise(() => undefined) };
    const { ctx, subject, lineas } = armar({ PUSH_TIMEOUT_MS: 25, ALERTAS_CONCURRENCIA: 2 }, true, colgado);
    ctx.lugarDAO.agregar({ id: LUGAR });
    await ctx.favoritoDAO.crear(1, LUGAR);
    await ctx.dispositivoDAO.registrar(1, 'tok-1', PlataformaPush.ANDROID);
    const inicio = Date.now();
    await subject.notificar(evento());
    expect(Date.now() - inicio).toBeLessThan(1000);
    expect(await ctx.alertaDAO.contarNoLeidas(1)).toBe(1);
    expect(lineas.some((l) => l.level === 50 && String(l.msg).includes('agoto el tiempo'))).toBe(true);
  });

  describe('POST /api/reportes con un observer que falla (S21)', () => {
    const reportarConObserver = async (observer: SaturacionObserver) => {
      const subject = new PublicadorSaturacion(crearLoggerEspia().logger);
      subject.suscribir(observer);
      const ctx = crearContenedorPrueba({ subject, cfg: { SATURACION_ESTRATEGIA: 'ULTIMO_REPORTE' } });
      const lugarId = ctx.lugarDAO.agregar({ nombre: 'Parque Kennedy' }).id;
      const seguidor = ctx.usuarioDAO.agregar(aUsuario());
      const autor = ctx.usuarioDAO.agregar(aUsuario());
      await ctx.favoritoDAO.crear(seguidor.id, lugarId);
      const res = await request(createApp(ctx.contenedor))
        .post('/api/reportes')
        .set({ Authorization: `Bearer ${ctx.emisorToken.emitir(autor).token}` })
        .send({ lugarId, nivel: 'SATURADO' });
      return { res, ctx, seguidor };
    };

    it('un observer que lanza: 201 y el seguidor igual recibe su alerta', async () => {
      const { res, ctx, seguidor } = await reportarConObserver({
        nombre: 'explosivo',
        alRecibir: () => {
          throw new Error('boom');
        },
      });
      expect(res.status).toBe(201);
      expect(res.body.data.saturacionLugar.nivel).toBe('SATURADO');
      expect(await ctx.alertaDAO.contarNoLeidas(seguidor.id)).toBe(1);
    });

    it('un observer que rechaza: tambien 201', async () => {
      const { res } = await reportarConObserver({ nombre: 'rechaza', alRecibir: () => Promise.reject(new Error('boom')) });
      expect(res.status).toBe(201);
    });
  });
});

describe('crearDaosFavoritoAlertaSequelize', () => {
  it('resuelve los nombres de lugar con el LugarDAO del contenedor (sin SQL propio)', async () => {
    const lugarDAO = new LugarDAOMemoria();
    const lugar = lugarDAO.agregar({ nombre: 'Plaza de Armas' });
    const { nombresLugar } = crearDaosFavoritoAlertaSequelize(lugarDAO);
    expect(await nombresLugar([lugar.id, lugar.id, 9_999])).toEqual(new Map([[lugar.id, 'Plaza de Armas']]));
  });
});
