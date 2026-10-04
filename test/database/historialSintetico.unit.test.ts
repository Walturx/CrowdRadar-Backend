/**
 * Synthetic history seeder (spec M4 R10): the pure generator, the SEED_SINTETICO switch and the seeder against an in-memory
 * query interface. The files are CommonJS (sequelize-cli loads them with require), so they are read through createRequire.
 */
import { createRequire } from 'node:module';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DOMINIO_EMAIL_SINTETICO } from '../../src/util/sintetico.js';

const requerir = createRequire(import.meta.url);
interface Fila {
  usuario_id: number;
  lugar_id: number;
  nivel_saturacion: 'TRANQUILO' | 'MODERADO' | 'SATURADO';
  fecha_hora: Date;
}
interface Lugar {
  id: number;
  categoria: string;
}
const lib = requerir('../../database/lib/historial-sintetico.cjs') as {
  DOMINIO_EMAIL: string;
  USUARIOS: { nombre: string; apellido: string; email: string }[];
  DIAS_HISTORIAL: number;
  habilitado(env: Record<string, string | undefined>): boolean;
  generarReportes(entrada: { lugares: Lugar[]; usuarioIds: number[]; hoy: string }): Fila[];
};
const seeder = requerir('../../database/seeders/20261005100003-historial-sintetico.cjs') as {
  up(queryInterface: unknown): Promise<void>;
  down(queryInterface: unknown): Promise<void>;
};

const HOY = '2026-10-07'; // Wednesday
const CATEGORIAS = ['PARQUE', 'CENTRO_COMERCIAL', 'MERCADO', 'TRANSPORTE', 'PLAZA', 'PLAYA'];
const LUGARES: Lugar[] = Array.from({ length: 45 }, (_, i) => ({ id: i + 1, categoria: CATEGORIAS[i % CATEGORIAS.length]! }));
const VALOR = { TRANQUILO: 1, MODERADO: 2, SATURADO: 3 } as const;

/** Lima calendar day, hour and weekend flag of a stored instant (Lima is UTC-5 all year). */
const enLima = (fecha: Date) => {
  const local = new Date(fecha.getTime() - 5 * 3_600_000);
  return { dia: local.toISOString().slice(0, 10), hora: local.getUTCHours(), finDeSemana: [0, 6].includes(local.getUTCDay()) };
};
const promedio = (filas: Fila[]) => filas.reduce((suma, f) => suma + VALOR[f.nivel_saturacion], 0) / filas.length;

describe('habilitado (SEED_SINTETICO)', () => {
  it('SEED_SINTETICO=true en produccion se rechaza: no se siembran datos de demostracion alli', () => {
    expect(() => lib.habilitado({ NODE_ENV: 'production', SEED_SINTETICO: 'true' })).toThrow(/production/);
    expect(() => lib.habilitado({ NODE_ENV: 'production', SEED_SINTETICO: '1' })).toThrow(/production/);
  });

  it.each([
    [{}, true],
    [{ NODE_ENV: 'development' }, true],
    [{ NODE_ENV: 'test' }, true],
    [{ NODE_ENV: 'production' }, false],
    [{ NODE_ENV: 'development', SEED_SINTETICO: 'false' }, false],
    [{ SEED_SINTETICO: 'FALSE' }, false],
    [{ SEED_SINTETICO: '1' }, true],
    [{ SEED_SINTETICO: '0', NODE_ENV: 'development' }, false],
    [{ SEED_SINTETICO: '', NODE_ENV: 'production' }, false],
  ])('%j -> %s', (env, esperado) => {
    expect(lib.habilitado(env)).toBe(esperado);
  });
});

describe('usuarios sinteticos', () => {
  it('son 3, con el dominio sintetico del backend, nombre "Demo NN" y correos distintos', () => {
    expect(lib.DOMINIO_EMAIL).toBe(DOMINIO_EMAIL_SINTETICO);
    expect(lib.USUARIOS).toHaveLength(3);
    expect(lib.USUARIOS.map((u) => u.nombre)).toEqual(['Demo 01', 'Demo 02', 'Demo 03']);
    for (const { email } of lib.USUARIOS) expect(email.endsWith(DOMINIO_EMAIL_SINTETICO)).toBe(true);
    expect(new Set(lib.USUARIOS.map((u) => u.email)).size).toBe(3);
  });
});

describe('generarReportes', () => {
  const entrada = { lugares: LUGARES, usuarioIds: [11, 12, 13], hoy: HOY };

  it('es determinista: la misma entrada da exactamente las mismas filas', () => {
    expect(lib.generarReportes(entrada)).toEqual(lib.generarReportes(entrada));
  });

  it('cubre las 4 semanas anteriores a hoy en los 45 lugares, sin fechas futuras ni horas fuera de 08:00-22:00', () => {
    const filas = lib.generarReportes(entrada);
    expect(new Set(filas.map((f) => f.lugar_id)).size).toBe(45);
    const dias = new Set(filas.map((f) => enLima(f.fecha_hora).dia));
    expect(dias.size).toBe(lib.DIAS_HISTORIAL);
    expect([...dias].sort()[0]).toBe('2026-09-09');
    expect([...dias].sort().at(-1)).toBe('2026-10-06');
    for (const f of filas) {
      const { hora } = enLima(f.fecha_hora);
      expect(hora).toBeGreaterThanOrEqual(8);
      expect(hora).toBeLessThan(22);
    }
    expect(filas.length).toBeGreaterThan(45 * 28 * 5);
    expect(filas.length).toBeLessThan(45 * 28 * 14);
  });

  it('solo usa los usuarios dados y reparte los reportes entre todos', () => {
    const filas = lib.generarReportes(entrada);
    expect(new Set(filas.map((f) => f.usuario_id))).toEqual(new Set([11, 12, 13]));
  });

  it('un lugar tiene al menos el minimo de muestras (5) en sus horas mas activas, para que la analitica muestre datos', () => {
    const filas = lib.generarReportes(entrada).filter((f) => f.lugar_id === 1);
    const porHora = new Map<number, number>();
    for (const f of filas) porHora.set(enLima(f.fecha_hora).hora, (porHora.get(enLima(f.fecha_hora).hora) ?? 0) + 1);
    expect([...porHora.values()].filter((n) => n >= 5).length).toBeGreaterThanOrEqual(8);
  });

  it('no repite (usuario, lugar, instante): el sembrado puede ser idempotente por clave', () => {
    const claves = lib.generarReportes(entrada).map((f) => `${f.usuario_id}|${f.lugar_id}|${f.fecha_hora.getTime()}`);
    expect(new Set(claves).size).toBe(claves.length);
  });

  it('un dia concreto de un lugar sale igual aunque "hoy" avance: ejecutar otro dia solo agrega dias nuevos', () => {
    const ayer = lib.generarReportes(entrada);
    const manana = lib.generarReportes({ ...entrada, hoy: '2026-10-08' });
    const delDia = (filas: Fila[]) => filas.filter((f) => enLima(f.fecha_hora).dia === '2026-10-05');
    expect(delDia(manana)).toEqual(delDia(ayer));
    expect(manana.length).not.toBe(0);
  });

  describe('patrones de hora realistas por categoria', () => {
    const filas = lib.generarReportes(entrada);
    const de = (categoria: string, filtro: (h: number, finde: boolean) => boolean) =>
      filas.filter((f) => {
        const lugar = LUGARES.find((l) => l.id === f.lugar_id)!;
        const { hora, finDeSemana } = enLima(f.fecha_hora);
        return lugar.categoria === categoria && filtro(hora, finDeSemana);
      });

    it('la playa se llena el fin de semana al mediodia y esta tranquila entre semana', () => {
      expect(promedio(de('PLAYA', (h, finde) => finde && h >= 11 && h <= 15))).toBeGreaterThan(
        promedio(de('PLAYA', (h, finde) => !finde && h >= 11 && h <= 15)) + 0.8,
      );
    });

    it('el transporte se satura en hora punta entre semana y se calma a media tarde', () => {
      expect(promedio(de('TRANSPORTE', (h, finde) => !finde && (h === 8 || h === 18)))).toBeGreaterThan(
        promedio(de('TRANSPORTE', (h, finde) => !finde && (h === 11 || h === 15))) + 0.8,
      );
    });

    it('el mercado es mas concurrido por la manana que por la noche', () => {
      expect(promedio(de('MERCADO', (h) => h >= 9 && h <= 11))).toBeGreaterThan(promedio(de('MERCADO', (h) => h >= 19)) + 0.8);
    });

    it('el centro comercial es mas concurrido el fin de semana por la tarde que un martes por la manana', () => {
      expect(promedio(de('CENTRO_COMERCIAL', (h, finde) => finde && h >= 15 && h <= 19))).toBeGreaterThan(
        promedio(de('CENTRO_COMERCIAL', (h, finde) => !finde && h <= 10)) + 0.8,
      );
    });

    it('usa los tres niveles', () => {
      expect(new Set(filas.map((f) => f.nivel_saturacion))).toEqual(new Set(['TRANQUILO', 'MODERADO', 'SATURADO']));
    });
  });
});

/** In-memory stand-in of the tables the seeder touches, answering the few queries it issues. */
function crearBd() {
  const usuarios: { id: number; email: string }[] = [{ id: 1, email: 'real@crowdradar.pe' }];
  const reportes: Fila[] = [
    { usuario_id: 1, lugar_id: 1, nivel_saturacion: 'MODERADO', fecha_hora: new Date('2026-10-01T15:00:00Z') },
  ];
  const consultas: string[] = [];
  /** Tables the seeder deleted from, in order. */
  const borrados: string[] = [];
  const query = async (sql: string, opciones: { replacements?: Record<string, unknown> } = {}) => {
    consultas.push(sql);
    const r = opciones.replacements ?? {};
    const sinteticos = () => usuarios.filter((u) => u.email.endsWith(DOMINIO_EMAIL_SINTETICO));
    const borrado = /^DELETE FROM (\w+)/.exec(sql)?.[1];
    if (borrado) borrados.push(borrado);
    if (borrado && borrado !== 'reporte_saturacion' && borrado !== 'usuario') return [[], undefined];
    if (sql.startsWith('DELETE FROM reporte_saturacion')) {
      const ids = new Set(sinteticos().map((u) => u.id));
      for (let i = reportes.length - 1; i >= 0; i -= 1) if (ids.has(reportes[i]!.usuario_id)) reportes.splice(i, 1);
      return [[], undefined];
    }
    if (sql.startsWith('DELETE FROM usuario')) {
      for (let i = usuarios.length - 1; i >= 0; i -= 1) if (usuarios[i]!.email.endsWith(DOMINIO_EMAIL_SINTETICO)) usuarios.splice(i, 1);
      return [[], undefined];
    }
    if (sql.includes('INSERT INTO usuario')) {
      if (!usuarios.some((u) => u.email === r.email)) usuarios.push({ id: usuarios.length + 1, email: r.email as string });
      return [[], undefined];
    }
    if (sql.includes('FROM usuario')) return [sinteticos(), undefined];
    if (sql.includes('FROM lugar')) return [LUGARES, undefined];
    if (sql.includes('FROM reporte_saturacion')) {
      const ids = new Set(sinteticos().map((u) => u.id));
      return [reportes.filter((f) => ids.has(f.usuario_id)), undefined];
    }
    throw new Error(`consulta inesperada: ${sql}`);
  };
  const queryInterface = {
    sequelize: { query },
    bulkInsert: async (tabla: string, filas: Fila[]) => {
      expect(tabla).toBe('reporte_saturacion');
      reportes.push(...filas);
    },
  };
  return { usuarios, reportes, consultas, borrados, queryInterface };
}

describe('seeder historial-sintetico', () => {
  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('SEED_SINTETICO', undefined);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('con SEED_SINTETICO=false no consulta ni inserta nada', async () => {
    vi.stubEnv('SEED_SINTETICO', 'false');
    const bd = crearBd();
    await seeder.up(bd.queryInterface);
    expect(bd.consultas).toEqual([]);
    expect(bd.usuarios).toHaveLength(1);
    expect(bd.reportes).toHaveLength(1);
  });

  it('en produccion sin la variable tampoco siembra', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const bd = crearBd();
    await seeder.up(bd.queryInterface);
    expect(bd.consultas).toEqual([]);
  });

  it('siembra 3 usuarios sinteticos y su historial en los 45 lugares', async () => {
    const bd = crearBd();
    await seeder.up(bd.queryInterface);
    const sinteticos = bd.usuarios.filter((u) => u.email.endsWith(DOMINIO_EMAIL_SINTETICO));
    expect(sinteticos).toHaveLength(3);
    const nuevos = bd.reportes.filter((f) => f.usuario_id !== 1);
    expect(nuevos.length).toBeGreaterThan(5000);
    expect(new Set(nuevos.map((f) => f.lugar_id)).size).toBe(45);
    expect(new Set(nuevos.map((f) => f.usuario_id))).toEqual(new Set(sinteticos.map((u) => u.id)));
  });

  it('es idempotente: sembrar dos veces deja los mismos usuarios y los mismos reportes', async () => {
    const bd = crearBd();
    await seeder.up(bd.queryInterface);
    const usuariosAntes = bd.usuarios.length;
    const reportesAntes = bd.reportes.length;
    await seeder.up(bd.queryInterface);
    expect(bd.usuarios).toHaveLength(usuariosAntes);
    expect(bd.reportes).toHaveLength(reportesAntes);
  });

  it('no toca a los usuarios ni a los reportes reales al sembrar ni al deshacer', async () => {
    const bd = crearBd();
    await seeder.up(bd.queryInterface);
    await seeder.down(bd.queryInterface);
    expect(bd.usuarios).toEqual([{ id: 1, email: 'real@crowdradar.pe' }]);
    expect(bd.reportes).toHaveLength(1);
    expect(bd.reportes[0]?.usuario_id).toBe(1);
  });

  it('deshacer borra primero lo que depende de los usuarios sinteticos y al final reportes y usuarios', async () => {
    const bd = crearBd();
    await seeder.up(bd.queryInterface);
    await seeder.down(bd.queryInterface);
    expect(bd.borrados).toEqual([
      'alerta',
      'lugar_favorito',
      'dispositivo_push',
      'validacion_reporte',
      'denuncia',
      'token_recuperacion',
      'sancion_usuario',
      'reporte_saturacion',
      'usuario',
    ]);
  });

  it('deshacer sin haber sembrado no falla', async () => {
    const bd = crearBd();
    await expect(seeder.down(bd.queryInterface)).resolves.toBeUndefined();
    expect(bd.reportes).toHaveLength(1);
  });

  it('dice en el log que los datos son sinteticos', async () => {
    const bd = crearBd();
    await seeder.up(bd.queryInterface);
    const mensajes = vi.mocked(console.log).mock.calls.map((c) => String(c[0])).join('\n');
    expect(mensajes).toMatch(/sint[eé]tic/i);
    expect(mensajes).toContain(DOMINIO_EMAIL_SINTETICO);
  });
});
