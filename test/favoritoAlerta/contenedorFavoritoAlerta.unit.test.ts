/**
 * Composition of the M3 stream: the observer is subscribed to the shared subject, so a published level change
 * reaches the favourites of the place (spec M3 R5, S15, S17, S21). Direct-call equivalent of the
 * "POST /reportes still answers 201 when an observer explodes" API test, which needs M4's route.
 */
import { describe, expect, it } from 'vitest';
import { construirFavoritoAlerta, crearDaosFavoritoAlertaSequelize } from '../../src/container/favoritoAlerta.js';
import { construirInfraestructura } from '../../src/container/infraestructura.js';
import { PlataformaPush } from '../../src/enum/PlataformaPush.js';
import { NivelSaturacion } from '../../src/enum/NivelSaturacion.js';
import { crearEventoSaturacion } from '../../src/pattern/observer/SaturacionCambiadaEvento.js';
import { PublicadorSaturacion } from '../../src/pattern/observer/PublicadorSaturacion.js';
import { configPrueba, type SobrescritosEntorno } from '../support/configPrueba.js';
import { crearContenedorPrueba } from '../support/crearContenedorPrueba.js';
import { LugarDAOMemoria } from '../support/dao/memoria/LugarDAOMemoria.js';
import { crearLoggerEspia } from '../support/LoggerEspia.js';

const LUGAR = 7;
const evento = () =>
  crearEventoSaturacion({
    ocurridoEn: new Date('2026-10-05T15:00:00Z'),
    lugarId: LUGAR,
    nivelAnterior: NivelSaturacion.MODERADO,
    nivelNuevo: NivelSaturacion.SATURADO,
    autorId: 99,
  });

function armar(cfg: SobrescritosEntorno = {}, conEspia = true) {
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
  construirFavoritoAlerta(infra, conEspia ? ctx.favoritoAlerta : { ...ctx.favoritoAlerta, notificador: undefined });
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

  it.todo('POST /api/reportes sigue respondiendo 201 con un observer que lanza (requiere la ruta de M4, T-BE-03c)');
});

describe('crearDaosFavoritoAlertaSequelize', () => {
  it('resuelve los nombres de lugar con el LugarDAO del contenedor (sin SQL propio)', async () => {
    const lugarDAO = new LugarDAOMemoria();
    const lugar = lugarDAO.agregar({ nombre: 'Plaza de Armas' });
    const { nombresLugar } = crearDaosFavoritoAlertaSequelize(lugarDAO);
    expect(await nombresLugar([lugar.id, lugar.id, 9_999])).toEqual(new Map([[lugar.id, 'Plaza de Armas']]));
  });
});
