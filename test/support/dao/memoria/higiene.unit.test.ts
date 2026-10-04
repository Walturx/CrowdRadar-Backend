/**
 * Hygiene of the in-memory DAOs (R3-504): they return snapshots, never references into their own store,
 * and stamp `createdAt`/`updatedAt` from the injected Reloj instead of `new Date()`.
 */
import { describe, expect, it } from 'vitest';
import { EstadoDenuncia } from '../../../../src/enum/EstadoDenuncia.js';
import { MotivoDenuncia } from '../../../../src/enum/MotivoDenuncia.js';
import { NivelSaturacion } from '../../../../src/enum/NivelSaturacion.js';
import { PlataformaPush } from '../../../../src/enum/PlataformaPush.js';
import { TipoAccionValidacion } from '../../../../src/enum/TipoAccionValidacion.js';
import { RelojFijo } from '../../RelojFijo.js';
import { AlertaDAOMemoria } from './AlertaDAOMemoria.js';
import { DenunciaDAOMemoria } from './DenunciaDAOMemoria.js';
import { DispositivoDAOMemoria } from './DispositivoDAOMemoria.js';
import { FavoritoDAOMemoria } from './FavoritoDAOMemoria.js';
import { LugarDAOMemoria } from './LugarDAOMemoria.js';
import { ReporteDAOMemoria } from './ReporteDAOMemoria.js';
import { SancionDAOMemoria } from './SancionDAOMemoria.js';
import { TokenRecuperacionDAOMemoria } from './TokenRecuperacionDAOMemoria.js';
import { UsuarioDAOMemoria } from './UsuarioDAOMemoria.js';
import { ValidacionDAOMemoria } from './ValidacionDAOMemoria.js';

const T0 = new Date('2030-01-02T03:04:05Z');
const T1 = new Date('2030-01-02T04:04:05Z');
const FECHA = new Date('2026-10-05T14:00:00Z');

interface Armado {
  creada: { createdAt: Date; updatedAt: Date; id: number };
  releer: () => Promise<unknown>;
  campo: string;
  /** Modifies the row; resolves to the modified entity when the DAO returns it. */
  tocar: () => Promise<unknown>;
}

interface Caso {
  nombre: string;
  armar: (r: RelojFijo) => Promise<Armado>;
}

const casos: Caso[] = [
  {
    nombre: 'AlertaDAOMemoria',
    armar: async (r) => {
      const dao = new AlertaDAOMemoria({ reloj: r });
      const creada = await dao.crear({
        favoritoId: 1,
        usuarioId: 2,
        lugarId: 3,
        nivelAnterior: null,
        nivelNuevo: 'SATURADO',
        mensaje: 'm',
        fechaHora: FECHA,
      });
      return {
        creada,
        campo: 'mensaje',
        releer: async () => (await dao.listarPorUsuario(2, { page: 1, size: 5 })).items[0],
        tocar: () => dao.marcarLeida(creada.id, 2),
      };
    },
  },
  {
    nombre: 'DenunciaDAOMemoria',
    armar: async (r) => {
      const dao = new DenunciaDAOMemoria({ reloj: r });
      const creada = await dao.crear({
        reporteId: 9,
        usuarioId: 2,
        motivo: MotivoDenuncia.SPAM,
        detalle: null,
        fechaHora: FECHA,
      });
      return {
        creada,
        campo: 'detalle',
        releer: async () => (await dao.listarReportesConPendientes({ page: 1, size: 5 })).items[0],
        tocar: () => dao.resolverPendientes(9, EstadoDenuncia.PROCEDENTE, 1, FECHA),
      };
    },
  },
  {
    nombre: 'DispositivoDAOMemoria',
    armar: async (r) => {
      const dao = new DispositivoDAOMemoria({ reloj: r });
      const { dispositivo: creada } = await dao.registrar(2, 'tok', PlataformaPush.ANDROID);
      return {
        creada,
        campo: 'tokenFcm',
        releer: async () => (await dao.registrar(2, 'tok', PlataformaPush.ANDROID)).dispositivo.tokenFcm,
        tocar: async () => (await dao.registrar(3, 'tok', PlataformaPush.ANDROID)).dispositivo,
      };
    },
  },
  {
    nombre: 'FavoritoDAOMemoria',
    armar: async (r) => {
      const dao = new FavoritoDAOMemoria({ reloj: r });
      const creada = await dao.crear(2, 3);
      return {
        creada,
        campo: 'alertasActivadas',
        releer: () => dao.buscar(2, 3),
        tocar: () => dao.actualizarAlertas(2, 3, false),
      };
    },
  },
  {
    nombre: 'ReporteDAOMemoria',
    armar: async (r) => {
      const dao = new ReporteDAOMemoria({ reloj: r });
      const creada = await dao.crear({
        usuarioId: 2,
        lugarId: 3,
        nivelSaturacion: NivelSaturacion.MODERADO,
        fechaHora: FECHA,
      });
      return {
        creada,
        campo: 'puntosOtorgados',
        releer: () => dao.buscarPorId(creada.id),
        tocar: () => dao.actualizarConfiabilidad(creada.id, 2),
      };
    },
  },
  {
    nombre: 'SancionDAOMemoria',
    armar: async (r) => {
      const dao = new SancionDAOMemoria({ reloj: r });
      const creada = await dao.crear({
        usuarioId: 2,
        administradorId: 1,
        dias: 3,
        motivo: 'm',
        fechaInicio: FECHA,
        fechaFin: new Date(FECHA.getTime() + 3 * 86_400_000),
      });
      return {
        creada,
        campo: 'motivo',
        releer: () => dao.buscarVigente(2, FECHA),
        tocar: () => dao.levantar(creada.id, 1, FECHA),
      };
    },
  },
  {
    nombre: 'TokenRecuperacionDAOMemoria',
    armar: async (r) => {
      const dao = new TokenRecuperacionDAOMemoria({ reloj: r });
      const hash = 'h'.repeat(64);
      const creada = await dao.crear({ usuarioId: 2, tokenHash: hash, expiraEn: FECHA });
      return {
        creada,
        campo: 'tokenHash',
        releer: () => dao.buscarPorHash(hash),
        tocar: () => dao.marcarUsado(creada.id, FECHA),
      };
    },
  },
  {
    nombre: 'UsuarioDAOMemoria',
    armar: async (r) => {
      const dao = new UsuarioDAOMemoria({ reloj: r });
      const creada = await dao.crear({
        nombre: 'Ana',
        apellido: 'P',
        email: 'ana@x.pe',
        passwordHash: 'h',
        telefono: null,
        distrito: null,
      });
      return {
        creada,
        campo: 'nombre',
        releer: () => dao.buscarPorId(creada.id),
        tocar: () => dao.actualizarStatus(creada.id, creada.status),
      };
    },
  },
  {
    nombre: 'ValidacionDAOMemoria',
    armar: async (r) => {
      const dao = new ValidacionDAOMemoria({ reloj: r });
      const creada = await dao.crear({
        reporteId: 9,
        usuarioId: 2,
        tipoAccion: TipoAccionValidacion.CONFIRMAR,
        karmaVotante: 4,
        puntosOtorgados: 1,
        fechaHora: FECHA,
      });
      return {
        creada,
        campo: 'karmaVotante',
        releer: () => dao.buscarPorUsuarioYReporte(2, 9),
        tocar: async () => undefined,
      };
    },
  },
];

describe.each(casos)('$nombre', ({ armar }) => {
  it('sella createdAt y updatedAt con el reloj inyectado', async () => {
    const { creada } = await armar(new RelojFijo(T0));
    expect(creada.createdAt).toEqual(T0);
    expect(creada.updatedAt).toEqual(T0);
  });

  it('devuelve copias: mutar lo devuelto no cambia el almacen', async () => {
    const { creada, releer, campo } = await armar(new RelojFijo(T0));
    const antes = structuredClone(await releer());
    (creada as unknown as Record<string, unknown>)[campo] = 'MUTADO';
    creada.createdAt.setTime(0);
    const leida = await releer();
    expect(leida).toEqual(antes);
    if (leida && typeof leida === 'object') (leida as Record<string, unknown>)[campo] = 'MUTADO';
    expect(await releer()).toEqual(antes);
  });

  it('updatedAt de una modificacion sale del reloj avanzado', async () => {
    const r = new RelojFijo(T0);
    const { tocar } = await armar(r);
    r.avanzarMinutos(60);
    const resultado = await tocar();
    if (resultado && typeof resultado === 'object') expect((resultado as { updatedAt: Date }).updatedAt).toEqual(T1);
  });
});

describe('LugarDAOMemoria', () => {
  it('devuelve copias y sella updatedAt con el reloj', async () => {
    const r = new RelojFijo(T0);
    const dao = new LugarDAOMemoria({ reloj: r });
    const lugar = dao.agregar({ nombre: 'Original' });
    const leido = await dao.buscarPorId(lugar.id);
    (leido as { nombre: string }).nombre = 'MUTADO';
    lugar.nombre = 'MUTADO TAMBIEN';
    expect((await dao.buscarPorId(lugar.id))?.nombre).toBe('Original');
    r.avanzarMinutos(60);
    expect((await dao.actualizarSaturacion(lugar.id, 'SATURADO', FECHA))?.updatedAt).toEqual(T1);
  });
});
