/**
 * Event publication of ReporteFacadeImpl.registrar after the commit: the HTTP answer never waits for the
 * subscribers beyond EVENTOS_PRESUPUESTO_MS (the delivery goes on in the background), and a report is logged once
 * with its outcome. Delivery is at-most-once (docs/decisiones.md).
 */
import { describe, expect, it } from 'vitest';
import { NivelSaturacion } from '../../src/enum/NivelSaturacion.js';
import type { SaturacionCambiadaEvento } from '../../src/pattern/observer/SaturacionCambiadaEvento.js';
import type { SaturacionSubject } from '../../src/pattern/observer/SaturacionSubject.js';
import { crearLoggerEspia } from '../support/LoggerEspia.js';
import { RelojFijo } from '../support/RelojFijo.js';
import { LugarDAOMemoria } from '../support/dao/memoria/LugarDAOMemoria.js';
import { ReporteDAOMemoria } from '../support/dao/memoria/ReporteDAOMemoria.js';
import { UsuarioDAOMemoria } from '../support/dao/memoria/UsuarioDAOMemoria.js';
import { ConexionFalsa } from '../support/ConexionFalsa.js';
import { crearFacadePrueba, INSTANTE_PRUEBA } from '../support/reporte/armarFacade.js';

const pausa = (ms: number) => new Promise<void>((resolver) => setTimeout(resolver, ms));

async function armar(subject: SaturacionSubject, presupuestoEventosMs: number) {
  const usuarioDAO = new UsuarioDAOMemoria();
  const lugarDAO = new LugarDAOMemoria();
  const { id: usuarioId } = await usuarioDAO.crear({
    nombre: 'Ana',
    apellido: 'Perez',
    email: 'ana@crowdradar.pe',
    passwordHash: 'h',
    telefono: null,
    distrito: null,
  });
  const lugarId = lugarDAO.agregar().id;
  const espia = crearLoggerEspia();
  const facade = crearFacadePrueba({
    usuarioDAO,
    lugarDAO,
    reporteDAO: new ReporteDAOMemoria(),
    conexion: new ConexionFalsa(),
    reloj: new RelojFijo(INSTANTE_PRUEBA),
    subject,
    logger: espia.logger,
    presupuestoEventosMs,
  });
  return { facade, usuarioId, lugarId, lugarDAO, lineas: espia.lineas };
}

describe('ReporteFacadeImpl.registrar: publicacion de eventos', () => {
  it('un suscriptor lento no retiene la respuesta mas alla del presupuesto; la entrega sigue en segundo plano', async () => {
    let entregado = false;
    const lento: SaturacionSubject = {
      suscribir: () => {},
      notificar: async () => {
        await pausa(150);
        entregado = true;
      },
    };
    const { facade, usuarioId, lugarId, lineas } = await armar(lento, 20);
    const inicio = Date.now();
    const resultado = await facade.registrar(usuarioId, lugarId, NivelSaturacion.SATURADO);
    expect(Date.now() - inicio).toBeLessThan(100);
    expect(resultado.lugar.saturacionActual).toBe('SATURADO');
    expect(entregado).toBe(false);
    const aviso = lineas.find((l) => l.level === 40);
    expect(aviso).toMatchObject({ lugarId, presupuestoMs: 20 });
    await pausa(200);
    expect(entregado).toBe(true);
  });

  it('un suscriptor rapido se espera: el evento ya esta entregado al responder y no hay aviso', async () => {
    const eventos: SaturacionCambiadaEvento[] = [];
    const rapido: SaturacionSubject = { suscribir: () => {}, notificar: async (e) => void eventos.push(e) };
    const { facade, usuarioId, lugarId, lineas } = await armar(rapido, 500);
    await facade.registrar(usuarioId, lugarId, NivelSaturacion.SATURADO);
    expect(eventos).toHaveLength(1);
    expect(lineas.filter((l) => l.level === 40)).toEqual([]);
  });

  it('un sujeto que rechaza despues del presupuesto no genera un rechazo sin manejar y se registra', async () => {
    const roto: SaturacionSubject = {
      suscribir: () => {},
      notificar: async () => {
        await pausa(60);
        throw new Error('cola caida');
      },
    };
    const { facade, usuarioId, lugarId, lineas } = await armar(roto, 10);
    await facade.registrar(usuarioId, lugarId, NivelSaturacion.SATURADO);
    await pausa(120);
    expect(lineas.find((l) => l.level === 50)).toMatchObject({ lugarId, msg: expect.stringContaining('publicacion') });
  });

  it('registra una linea info por reporte con ids, nivel anterior y nuevo, y puntos', async () => {
    const { facade, usuarioId, lugarId, lineas } = await armar({ suscribir: () => {}, notificar: async () => {} }, 500);
    const { reporte } = await facade.registrar(usuarioId, lugarId, NivelSaturacion.MODERADO);
    const linea = lineas.find((l) => l.msg === 'Reporte registrado');
    expect(linea).toMatchObject({
      level: 30,
      reporteId: reporte.id,
      usuarioId,
      lugarId,
      nivelAnterior: null,
      nivelNuevo: 'MODERADO',
      puntos: 10,
    });
  });

  it('el tope diario se ve en la linea: puntos 0 cuando el reporte ya no premia', async () => {
    const { facade, usuarioId, lugarId, lugarDAO, lineas } = await armar({ suscribir: () => {}, notificar: async () => {} }, 500);
    const lugarIds = [lugarId, ...Array.from({ length: 5 }, (_, i) => lugarDAO.agregar({ id: lugarId + 1 + i }).id)];
    for (const id of lugarIds) await facade.registrar(usuarioId, id, NivelSaturacion.MODERADO);
    expect(lineas.filter((l) => l.msg === 'Reporte registrado').map((l) => l.puntos)).toEqual([10, 10, 10, 10, 10, 0]);
  });
});
