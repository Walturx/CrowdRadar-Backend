/**
 * Unit tests of ReporteFacadeImpl (rubric: unit target of M4). Real services over in-memory DAOs; the saturation
 * strategy is "latest report" so each case controls the level change with one report. Spec M4 R1, R2, R6, S1, S3.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import type { LugarDAO } from '../../src/dao/LugarDAO.js';
import type { ReporteDAO } from '../../src/dao/ReporteDAO.js';
import type { ContextoTx } from '../../src/datasource/ConexionBD.js';
import type { ReporteSaturacion } from '../../src/entity/ReporteSaturacion.js';
import { NivelSaturacion } from '../../src/enum/NivelSaturacion.js';
import { CodigoError } from '../../src/exception/CodigoError.js';
import { ReporteFacadeImpl } from '../../src/facade/impl/ReporteFacadeImpl.js';
import { PublicadorSaturacion } from '../../src/pattern/observer/PublicadorSaturacion.js';
import type { SaturacionCambiadaEvento } from '../../src/pattern/observer/SaturacionCambiadaEvento.js';
import type { SaturacionObserver } from '../../src/pattern/observer/SaturacionObserver.js';
import type { SaturacionSubject } from '../../src/pattern/observer/SaturacionSubject.js';
import { SaturacionUltimoReporteStrategy } from '../../src/pattern/strategy/saturacion/impl/SaturacionUltimoReporteStrategy.js';
import { ReporteServiceImpl } from '../../src/service/impl/ReporteServiceImpl.js';
import { puntajeEnMemoria } from '../support/puntajePrueba.js';
import { SaturacionServiceImpl } from '../../src/service/impl/SaturacionServiceImpl.js';
import { ConexionFalsa } from '../support/ConexionFalsa.js';
import { crearLoggerEspia } from '../support/LoggerEspia.js';
import { RelojFijo } from '../support/RelojFijo.js';
import { LugarDAOMemoria } from '../support/dao/memoria/LugarDAOMemoria.js';
import { ReporteDAOMemoria } from '../support/dao/memoria/ReporteDAOMemoria.js';
import { UsuarioDAOMemoria } from '../support/dao/memoria/UsuarioDAOMemoria.js';

const T0 = new Date('2026-10-05T15:00:00Z');
const { TRANQUILO, MODERADO, SATURADO } = NivelSaturacion;

/** ConexionFalsa that counts transactions that finished without throwing (the in-memory "commit"). */
class ConexionConConfirmacion extends ConexionFalsa {
  confirmadas = 0;
  override async transaccion<T>(trabajo: (tx: ContextoTx) => Promise<T>): Promise<T> {
    const resultado = await super.transaccion(trabajo);
    this.confirmadas += 1;
    return resultado;
  }
}

/** Subject double that keeps the events, plus whether the transaction had already committed when they arrived. */
class SujetoEspia implements SaturacionSubject {
  eventos: SaturacionCambiadaEvento[] = [];
  confirmadasAlNotificar: number[] = [];
  constructor(private readonly conexion: ConexionConConfirmacion) {}
  suscribir(): void {}
  async notificar(evento: SaturacionCambiadaEvento): Promise<void> {
    this.eventos.push(evento);
    this.confirmadasAlNotificar.push(this.conexion.confirmadas);
  }
}

describe('ReporteFacadeImpl.registrar', () => {
  let reloj: RelojFijo;
  let usuarioDAO: UsuarioDAOMemoria;
  let lugarDAO: LugarDAOMemoria;
  let reporteDAO: ReporteDAOMemoria;
  let conexion: ConexionConConfirmacion;
  let sujeto: SujetoEspia;
  let usuarioId: number;
  let lugarId: number;
  let facade: ReporteFacadeImpl;
  let llamadas: string[];

  const armar = (subject: SaturacionSubject = sujeto) => {
    const { logger } = crearLoggerEspia();
    const reporteServiceBase = new ReporteServiceImpl({ reporteDAO, lugarDAO, reloj, cooldownMin: 30, puntajeService: puntajeEnMemoria(reporteDAO) });
    const reporteService = {
      validarCooldown: (...a: Parameters<ReporteServiceImpl['validarCooldown']>) => {
        llamadas.push('cooldown');
        return reporteServiceBase.validarCooldown(...a);
      },
      crear: (...a: Parameters<ReporteServiceImpl['crear']>) => {
        llamadas.push('crear');
        return reporteServiceBase.crear(...a);
      },
      listarMios: (...a: Parameters<ReporteServiceImpl['listarMios']>) => reporteServiceBase.listarMios(...a),
    };
    const saturacionService = new SaturacionServiceImpl({
      lugarDAO,
      reporteDAO,
      estrategia: new SaturacionUltimoReporteStrategy({ ventanaMin: 60 }),
      reloj,
      ventanaMin: 60,
    });
    return new ReporteFacadeImpl({ lugarDAO, reporteService, saturacionService, subject, conexion, logger });
  };

  const crearUsuario = async (email: string) =>
    (await usuarioDAO.crear({ nombre: 'Ana', apellido: 'Perez', email, passwordHash: 'h', telefono: null, distrito: null })).id;

  beforeEach(async () => {
    llamadas = [];
    reloj = new RelojFijo(T0);
    usuarioDAO = new UsuarioDAOMemoria();
    lugarDAO = new LugarDAOMemoria();
    reporteDAO = new ReporteDAOMemoria();
    conexion = new ConexionConConfirmacion();
    sujeto = new SujetoEspia(conexion);
    usuarioId = await crearUsuario('ana@crowdradar.pe');
    lugarId = lugarDAO.agregar().id;
    facade = armar();
  });

  describe('cambio de nivel', () => {
    it('crea el reporte, guarda el nivel del lugar y devuelve reporte y lugar, sin otorgar nada (CRO-72)', async () => {
      const resultado = await facade.registrar(usuarioId, lugarId, MODERADO);
      expect(Object.keys(resultado).sort()).toEqual(['lugar', 'reporte']);
      expect(resultado.reporte).toMatchObject({ usuarioId, lugarId, nivelSaturacion: 'MODERADO', estado: 'ACTIVO' });
      expect(resultado.lugar).toMatchObject({ id: lugarId, saturacionActual: 'MODERADO', saturacionActualizadaEn: T0 });
      expect(await lugarDAO.buscarPorId(lugarId)).toMatchObject({ saturacionActual: 'MODERADO', saturacionActualizadaEn: T0 });
    });

    it('notifica una sola vez con lugar, niveles, autor y hora', async () => {
      await facade.registrar(usuarioId, lugarId, SATURADO);
      expect(sujeto.eventos).toEqual([
        {
          tipo: 'SATURACION_CAMBIADA',
          ocurridoEn: T0,
          lugarId,
          nivelAnterior: null,
          nivelNuevo: 'SATURADO',
          autorId: usuarioId,
        },
      ]);
    });

    it('notifica solo despues del commit', async () => {
      await facade.registrar(usuarioId, lugarId, SATURADO);
      expect(sujeto.confirmadasAlNotificar).toEqual([1]);
    });
  });

  describe('mismo nivel', () => {
    it('no notifica cuando el nivel del lugar no cambia (pero el reporte si se guarda)', async () => {
      const otro = await crearUsuario('luis@crowdradar.pe');
      await facade.registrar(otro, lugarId, MODERADO);
      sujeto.eventos = [];
      const resultado = await facade.registrar(usuarioId, lugarId, MODERADO);
      expect(sujeto.eventos).toEqual([]);
      expect(resultado.reporte).toMatchObject({ usuarioId, lugarId });
      expect((await reporteDAO.listarPorUsuario(usuarioId, { page: 1, size: 10 })).total).toBe(1);
    });

    it('un cambio posterior de nivel vuelve a notificar con el nivel anterior', async () => {
      const otro = await crearUsuario('luis@crowdradar.pe');
      await facade.registrar(otro, lugarId, TRANQUILO);
      reloj.avanzarMinutos(1);
      await facade.registrar(usuarioId, lugarId, SATURADO);
      expect(sujeto.eventos).toHaveLength(2);
      expect(sujeto.eventos[1]).toMatchObject({ nivelAnterior: 'TRANQUILO', nivelNuevo: 'SATURADO', autorId: usuarioId });
    });
  });

  describe('rechazos', () => {
    it('lugar inexistente: 404 LUGAR_NO_ENCONTRADO sin escribir nada', async () => {
      await expect(facade.registrar(usuarioId, 424242, MODERADO)).rejects.toMatchObject({
        status: 404,
        code: CodigoError.LUGAR_NO_ENCONTRADO,
      });
      expect((await reporteDAO.listarPorUsuario(usuarioId, { page: 1, size: 10 })).total).toBe(0);
      expect(conexion.transacciones).toBe(0);
      expect(sujeto.eventos).toEqual([]);
    });

    it('cooldown: 422 REPORTE_EN_ESPERA sin fila nueva y sin evento', async () => {
      await facade.registrar(usuarioId, lugarId, MODERADO);
      sujeto.eventos = [];
      reloj.avanzarMinutos(10);
      await expect(facade.registrar(usuarioId, lugarId, SATURADO)).rejects.toMatchObject({
        status: 422,
        code: CodigoError.REPORTE_EN_ESPERA,
        message: 'Ya reportaste este lugar. Vuelve a intentarlo en 20 minutos.',
      });
      expect((await reporteDAO.listarPorUsuario(usuarioId, { page: 1, size: 10 })).total).toBe(1);
      expect(sujeto.eventos).toEqual([]);
    });

    it('tras el cooldown (30 min) el mismo usuario puede volver a reportar el lugar', async () => {
      const primero = await facade.registrar(usuarioId, lugarId, MODERADO);
      reloj.avanzarMinutos(30);
      const segundo = await facade.registrar(usuarioId, lugarId, MODERADO);
      expect(segundo.reporte.id).not.toBe(primero.reporte.id);
      expect((await reporteDAO.listarPorUsuario(usuarioId, { page: 1, size: 10 })).total).toBe(2);
    });
  });

  describe('sin tope diario (CRO-72)', () => {
    it('el sexto reporte del dia se registra igual que los cinco anteriores', async () => {
      for (let i = 0; i < 5; i += 1) await facade.registrar(usuarioId, lugarDAO.agregar().id, MODERADO);
      const sexto = await facade.registrar(usuarioId, lugarId, MODERADO);
      expect(Object.keys(sexto).sort()).toEqual(['lugar', 'reporte']);
      expect(sexto.reporte).toMatchObject({ usuarioId, lugarId, estado: 'ACTIVO' });
      expect((await reporteDAO.listarPorUsuario(usuarioId, { page: 1, size: 10 })).total).toBe(6);
    });
  });

  describe('observadores', () => {
    it('un suscriptor que falla no rompe el reporte y los demas suscriptores se ejecutan', async () => {
      const { logger } = crearLoggerEspia();
      const publicador = new PublicadorSaturacion(logger);
      const recibidos: SaturacionCambiadaEvento[] = [];
      const roto: SaturacionObserver = { nombre: 'roto', alRecibir: () => Promise.reject(new Error('boom')) };
      const sano: SaturacionObserver = { nombre: 'sano', alRecibir: (e) => void recibidos.push(e) };
      publicador.suscribir(roto);
      publicador.suscribir(sano);
      const resultado = await armar(publicador).registrar(usuarioId, lugarId, SATURADO);
      expect(resultado.reporte).toMatchObject({ nivelSaturacion: 'SATURADO' });
      expect(recibidos).toHaveLength(1);
      expect(recibidos[0]).toMatchObject({ lugarId, nivelNuevo: 'SATURADO' });
    });

    it('un sujeto que rechaza la notificacion tampoco rompe el reporte', async () => {
      const sujetoRoto: SaturacionSubject = { suscribir: () => {}, notificar: () => Promise.reject(new Error('caido')) };
      const resultado = await armar(sujetoRoto).registrar(usuarioId, lugarId, SATURADO);
      expect(resultado.reporte).toMatchObject({ nivelSaturacion: 'SATURADO' });
    });
  });

  describe('transaccion', () => {
    it('si falla un paso de la transaccion no se notifica y el error se propaga', async () => {
      lugarDAO.actualizarSaturacion = () => Promise.reject(new Error('BD caida'));
      await expect(facade.registrar(usuarioId, lugarId, SATURADO)).rejects.toThrow('BD caida');
      expect(sujeto.eventos).toEqual([]);
      expect(conexion.confirmadas).toBe(0);
    });

    it('orden: lugar, una sola transaccion con cooldown, bloqueo del lugar, crear, y al final la notificacion', async () => {
      const lugares: LugarDAO = lugarDAO;
      const buscarLugar = lugarDAO.buscarPorId.bind(lugarDAO);
      lugares.buscarPorId = async (id, tx) => {
        llamadas.push(tx ? 'lugar-en-tx' : 'lugar');
        return buscarLugar(id);
      };
      lugares.buscarPorIdParaActualizar = async (id) => {
        llamadas.push('bloqueo-lugar');
        return buscarLugar(id);
      };
      await facade.registrar(usuarioId, lugarId, SATURADO);
      // The recompute reuses the locked row: no 'lugar-en-tx' read after 'crear' (phase 3, one round trip less).
      expect(llamadas).toEqual(['lugar', 'cooldown', 'bloqueo-lugar', 'crear']);
      expect(conexion.transacciones).toBe(1);
    });

    it('el cooldown corre dentro de la transaccion: recibe el mismo tx que el insert', async () => {
      const recibidos: { metodo: string; tx?: ContextoTx }[] = [];
      const reportes: ReporteDAO = reporteDAO;
      const ultimo = reportes.buscarUltimoDeUsuarioEnLugar.bind(reporteDAO);
      const crear = reportes.crear.bind(reporteDAO);
      reportes.buscarUltimoDeUsuarioEnLugar = (u, l, tx) => {
        recibidos.push({ metodo: 'ultimo', tx });
        return ultimo(u, l, tx);
      };
      reportes.crear = (datos, tx): Promise<ReporteSaturacion> => {
        recibidos.push({ metodo: 'crear', tx });
        return crear(datos, tx);
      };
      await facade.registrar(usuarioId, lugarId, SATURADO);
      expect(recibidos.map((r) => r.metodo)).toEqual(['ultimo', 'crear']);
      expect(recibidos[0]?.tx).toBeDefined();
      expect(recibidos[0]?.tx).toBe(recibidos[1]?.tx);
    });
  });
});
