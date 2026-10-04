/**
 * Integrante: stream M3 (favoritos y alertas)
 * Tecnica: caja blanca (cobertura de decisiones y condiciones, aislamiento de fallos)
 * Metodo: AlertaFavoritosObserver.alCambiarSaturacion (spec M3 R5, S15-S20; HU 8.3 c1, c3)
 * CC: 12 = 1 + if(nivelNuevo null) + if(anterior == nuevo) + if(autor) + if(sin destinatarios) + for(destinatarios)
 *     + if(sin tokens) + if(invalidos) + catch(push) + catch(destinatario) + catch(nombre) + catch(evento)
 * Cada caso nombra el camino que cubre.
 */
import { describe, expect, it } from 'vitest';
import type { NotificacionPush, NotificadorPush, ResultadoPush } from '../../src/adapter/push/NotificadorPush.js';
import type { AlertaDAO } from '../../src/dao/AlertaDAO.js';
import type { FavoritoDAO } from '../../src/dao/FavoritoDAO.js';
import { PlataformaPush } from '../../src/enum/PlataformaPush.js';
import { NivelSaturacion } from '../../src/enum/NivelSaturacion.js';
import { AlertaFavoritosObserver } from '../../src/pattern/observer/AlertaFavoritosObserver.js';
import { crearEventoSaturacion, type SaturacionCambiadaEvento } from '../../src/pattern/observer/SaturacionCambiadaEvento.js';
import { AlertaDAOMemoria } from '../support/dao/memoria/AlertaDAOMemoria.js';
import { DispositivoDAOMemoria } from '../support/dao/memoria/DispositivoDAOMemoria.js';
import { FavoritoDAOMemoria } from '../support/dao/memoria/FavoritoDAOMemoria.js';
import { NotificadorEspia } from '../support/adapter/NotificadorEspia.js';
import { crearLoggerEspia } from '../support/LoggerEspia.js';

const { TRANQUILO, MODERADO, SATURADO } = NivelSaturacion;
const LUGAR = 7;
const AUTOR = 99;
const AHORA = new Date('2026-10-05T15:00:00Z');
const NIVEL_ERROR = 50;

const evento = (cambios: Partial<Omit<SaturacionCambiadaEvento, 'tipo'>> = {}) =>
  crearEventoSaturacion({
    ocurridoEn: AHORA,
    lugarId: LUGAR,
    nivelAnterior: MODERADO,
    nivelNuevo: SATURADO,
    autorId: AUTOR,
    ...cambios,
  });

interface Opciones {
  notificador?: NotificadorPush;
  favoritoDAO?: FavoritoDAO;
  alertaDAO?: AlertaDAO;
  nombres?: (ids: readonly number[]) => Promise<ReadonlyMap<number, string>>;
}

function armar(opciones: Opciones = {}) {
  const alertas = new AlertaDAOMemoria();
  const favoritos = new FavoritoDAOMemoria({ alertas });
  const dispositivos = new DispositivoDAOMemoria();
  const espia = new NotificadorEspia();
  const { logger, lineas } = crearLoggerEspia();
  const observer = new AlertaFavoritosObserver({
    favoritoDAO: opciones.favoritoDAO ?? favoritos,
    alertaDAO: opciones.alertaDAO ?? alertas,
    dispositivoDAO: dispositivos,
    notificador: opciones.notificador ?? espia,
    nombresLugar: opciones.nombres ?? (async (ids) => new Map(ids.map((id) => [id, 'Parque Kennedy']))),
    logger,
  });
  const errores = () => lineas.filter((l) => l.level === NIVEL_ERROR);
  const seguir = (usuarioId: number, lugarId = LUGAR) => favoritos.crear(usuarioId, lugarId);
  const dispositivo = (usuarioId: number, token: string) =>
    dispositivos.registrar(usuarioId, token, PlataformaPush.ANDROID);
  return { observer, alertas, favoritos, dispositivos, espia, errores, seguir, dispositivo };
}

describe('AlertaFavoritosObserver.alCambiarSaturacion (caja blanca)', () => {
  describe('decisiones de salida temprana', () => {
    it('mismo nivel (anterior == nuevo): no crea alertas ni envia push aunque haya favoritos con alertas', async () => {
      const t = armar();
      await t.seguir(1);
      await t.dispositivo(1, 'tok-1');
      await t.observer.alCambiarSaturacion(evento({ nivelAnterior: SATURADO, nivelNuevo: SATURADO }));
      expect(await t.alertas.contarNoLeidas(1)).toBe(0);
      expect(t.espia.llamadas).toHaveLength(0);
    });

    it('nuevo nivel null (lectura vencida): no alerta aunque el nivel anterior exista', async () => {
      const t = armar();
      await t.seguir(1);
      await t.dispositivo(1, 'tok-1');
      await t.observer.alCambiarSaturacion(evento({ nivelAnterior: SATURADO, nivelNuevo: null }));
      expect(await t.alertas.contarNoLeidas(1)).toBe(0);
      expect(t.espia.llamadas).toHaveLength(0);
    });

    it('sin favoritos del lugar: no alerta a quien sigue otro lugar', async () => {
      const t = armar();
      await t.seguir(1, LUGAR + 1);
      await t.dispositivo(1, 'tok-1');
      await t.observer.alCambiarSaturacion(evento());
      expect(await t.alertas.contarNoLeidas(1)).toBe(0);
      expect(t.espia.llamadas).toHaveLength(0);
    });

    it('el unico seguidor es el autor del reporte: nadie recibe nada', async () => {
      const t = armar();
      await t.seguir(AUTOR);
      await t.dispositivo(AUTOR, 'tok-autor');
      await t.observer.alCambiarSaturacion(evento());
      expect(await t.alertas.contarNoLeidas(AUTOR)).toBe(0);
      expect(t.espia.llamadas).toHaveLength(0);
    });

    it('un seguidor con las alertas apagadas queda fuera aunque tenga dispositivo', async () => {
      const t = armar();
      await t.seguir(1);
      await t.favoritos.actualizarAlertas(1, LUGAR, false);
      await t.dispositivo(1, 'tok-1');
      await t.observer.alCambiarSaturacion(evento());
      expect(await t.alertas.contarNoLeidas(1)).toBe(0);
      expect(t.espia.llamadas).toHaveLength(0);
    });
  });

  describe('camino principal: destinatarios', () => {
    it('alerta a los seguidores A y B con alertas activas y omite al autor y al que las apago', async () => {
      const t = armar();
      for (const usuario of [1, 2, 3, AUTOR]) await t.seguir(usuario);
      await t.favoritos.actualizarAlertas(3, LUGAR, false);
      await t.observer.alCambiarSaturacion(evento());
      expect(await t.alertas.contarNoLeidas(1)).toBe(1);
      expect(await t.alertas.contarNoLeidas(2)).toBe(1);
      expect(await t.alertas.contarNoLeidas(3)).toBe(0);
      expect(await t.alertas.contarNoLeidas(AUTOR)).toBe(0);
    });

    it('persiste la alerta con niveles, mensaje, fecha del evento, no leida y vinculada a su favorito', async () => {
      const t = armar();
      const favorito = await t.seguir(1);
      await t.observer.alCambiarSaturacion(evento());
      const [alerta] = (await t.alertas.listarPorUsuario(1, { page: 1, size: 5 })).items;
      expect(alerta).toMatchObject({
        favoritoId: favorito.id,
        usuarioId: 1,
        lugarId: LUGAR,
        nivelAnterior: MODERADO,
        nivelNuevo: SATURADO,
        leida: false,
        fechaHora: AHORA,
        mensaje: 'Parque Kennedy ahora está Saturado. La saturación cambió de Moderado a Saturado.',
      });
    });

    it('primer nivel conocido (anterior null): guarda nivelAnterior null y redacta "Sin información"', async () => {
      const t = armar();
      await t.seguir(1);
      await t.observer.alCambiarSaturacion(evento({ nivelAnterior: null, nivelNuevo: TRANQUILO }));
      const [alerta] = (await t.alertas.listarPorUsuario(1, { page: 1, size: 5 })).items;
      expect(alerta?.nivelAnterior).toBeNull();
      expect(alerta?.mensaje).toBe(
        'Parque Kennedy ahora está Tranquilo. La saturación cambió de Sin información a Tranquilo.',
      );
    });

    it('recorta el mensaje a 200 caracteres (limite de la columna)', async () => {
      const t = armar({ nombres: async (ids) => new Map(ids.map((id) => [id, 'X'.repeat(150)])) });
      await t.seguir(1);
      await t.observer.alCambiarSaturacion(evento());
      const [alerta] = (await t.alertas.listarPorUsuario(1, { page: 1, size: 5 })).items;
      expect(alerta?.mensaje).toHaveLength(200);
    });
  });

  describe('push', () => {
    it('la alerta se persiste ANTES de enviar el push (el espia ya la ve al ser llamado)', async () => {
      const t = armar();
      await t.seguir(1);
      await t.dispositivo(1, 'tok-1');
      let alertasAlEnviar = -1;
      const original = t.espia.enviar.bind(t.espia);
      t.espia.enviar = async (tokens, notificacion) => {
        alertasAlEnviar = await t.alertas.contarNoLeidas(1);
        return original(tokens, notificacion);
      };
      await t.observer.alCambiarSaturacion(evento());
      expect(alertasAlEnviar).toBe(1);
      expect(t.espia.llamadas).toHaveLength(1);
    });

    it('sin dispositivos: la alerta queda y no hay llamada de push', async () => {
      const t = armar();
      await t.seguir(1);
      await t.observer.alCambiarSaturacion(evento());
      expect(await t.alertas.contarNoLeidas(1)).toBe(1);
      expect(t.espia.llamadas).toHaveLength(0);
    });

    it('envia solo los tokens del destinatario, con titulo del lugar y data.lugarId como string', async () => {
      const t = armar();
      await t.seguir(1);
      await t.seguir(2);
      await t.dispositivo(1, 'tok-1a');
      await t.dispositivo(1, 'tok-1b');
      await t.dispositivo(2, 'tok-2');
      await t.observer.alCambiarSaturacion(evento());
      const paraUno = t.espia.llamadas.find((l) => l.tokens.includes('tok-1a'));
      expect(paraUno?.tokens).toEqual(['tok-1a', 'tok-1b']);
      expect(paraUno?.notificacion).toMatchObject<Partial<NotificacionPush>>({
        titulo: 'Parque Kennedy',
        data: { lugarId: String(LUGAR) },
      });
      expect(paraUno?.notificacion.cuerpo).toContain('Saturado');
      expect(t.espia.llamadas.find((l) => l.tokens.includes('tok-2'))?.tokens).toEqual(['tok-2']);
    });

    it('borra los tokens que el proveedor devuelve como invalidos y conserva los demas', async () => {
      const t = armar();
      await t.seguir(1);
      await t.dispositivo(1, 'valido');
      await t.dispositivo(1, 'muerto');
      t.espia.invalidos = ['muerto'];
      await t.observer.alCambiarSaturacion(evento());
      expect(await t.dispositivos.listarTokensPorUsuario(1)).toEqual(['valido']);
    });

    it('sin tokens invalidos no borra ningun dispositivo', async () => {
      const t = armar();
      await t.seguir(1);
      await t.dispositivo(1, 'valido');
      await t.observer.alCambiarSaturacion(evento());
      expect(await t.dispositivos.listarTokensPorUsuario(1)).toEqual(['valido']);
    });
  });

  describe('aislamiento de fallos', () => {
    it('el adaptador de push lanza para un usuario: su alerta queda, se registra el error y el otro es atendido', async () => {
      const llamados: string[] = [];
      const notificador: NotificadorPush = {
        async enviar(tokens): Promise<ResultadoPush> {
          if (tokens.includes('tok-1')) throw new Error('FCM caido');
          llamados.push(...tokens);
          return { enviados: tokens.length, tokensInvalidos: [] };
        },
      };
      const t = armar({ notificador });
      await t.seguir(1);
      await t.seguir(2);
      await t.dispositivo(1, 'tok-1');
      await t.dispositivo(2, 'tok-2');
      await expect(t.observer.alCambiarSaturacion(evento())).resolves.toBeUndefined();
      expect(await t.alertas.contarNoLeidas(1)).toBe(1);
      expect(await t.alertas.contarNoLeidas(2)).toBe(1);
      expect(llamados).toEqual(['tok-2']);
      expect(t.errores()).toHaveLength(1);
      expect(JSON.stringify(t.errores())).not.toContain('tok-1');
    });

    it('fallo al persistir la alerta de un destinatario: los demas igual la reciben y el observer no lanza', async () => {
      const alertas = new AlertaDAOMemoria();
      const crear = alertas.crear.bind(alertas);
      alertas.crear = async (datos) => {
        if (datos.usuarioId === 1) throw new Error('bd caida');
        return crear(datos);
      };
      const t = armar({ alertaDAO: alertas });
      await t.seguir(1);
      await t.seguir(2);
      await expect(t.observer.alCambiarSaturacion(evento())).resolves.toBeUndefined();
      expect(await alertas.contarNoLeidas(2)).toBe(1);
      expect(t.errores()).toHaveLength(1);
    });

    it('fallo al leer los favoritos: el observer no lanza y registra el error', async () => {
      const favoritoDAO = {
        listarConAlertasPorLugar: async () => {
          throw new Error('bd caida');
        },
      } as unknown as FavoritoDAO;
      const t = armar({ favoritoDAO });
      await expect(t.observer.alCambiarSaturacion(evento())).resolves.toBeUndefined();
      expect(t.errores()).toHaveLength(1);
    });

    it('no se puede resolver el nombre del lugar: alerta igual con un texto generico y registra el error', async () => {
      const t = armar({
        nombres: async () => {
          throw new Error('bd caida');
        },
      });
      await t.seguir(1);
      await t.observer.alCambiarSaturacion(evento());
      const [alerta] = (await t.alertas.listarPorUsuario(1, { page: 1, size: 5 })).items;
      expect(alerta?.mensaje).toBe(
        'Un lugar de tus favoritos ahora está Saturado. La saturación cambió de Moderado a Saturado.',
      );
      expect(t.errores()).toHaveLength(1);
    });

    it('un lugar sin nombre en el resultado (borrado en carrera) tambien usa el texto generico', async () => {
      const t = armar({ nombres: async () => new Map() });
      await t.seguir(1);
      await t.observer.alCambiarSaturacion(evento());
      const [alerta] = (await t.alertas.listarPorUsuario(1, { page: 1, size: 5 })).items;
      expect(alerta?.mensaje.startsWith('Un lugar de tus favoritos ahora está')).toBe(true);
    });
  });

  describe('contrato SaturacionObserver', () => {
    it('alRecibir delega en alCambiarSaturacion y expone su nombre para los logs del publicador', async () => {
      const t = armar();
      await t.seguir(1);
      await t.observer.alRecibir(evento());
      expect(t.observer.nombre).toBe('alerta-favoritos');
      expect(await t.alertas.contarNoLeidas(1)).toBe(1);
    });
  });
});
