/**
 * ConfiguracionApp (Singleton, fail-fast) and the zod environment schema.
 * Spec: R-A3.1, R-A3.2, R-A3.3.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfiguracionApp } from '../../src/config/ConfiguracionApp.js';
import { validarEntorno } from '../../src/config/esquemaEntorno.js';

const SECRETO_VALIDO = 'j'.repeat(40);

const entornoMinimo = (extra: Record<string, string> = {}) => ({
  DB_PASSWORD: 'clave-bd',
  JWT_SECRETO: SECRETO_VALIDO,
  ...extra,
});

function aplicarEntorno(entorno: Record<string, string | undefined>) {
  for (const [clave, valor] of Object.entries(entorno)) vi.stubEnv(clave, valor);
}

describe('ConfiguracionApp', () => {
  beforeEach(() => {
    ConfiguracionApp.reiniciar();
    vi.stubEnv('DB_PASSWORD', undefined);
    vi.stubEnv('JWT_SECRETO', undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    ConfiguracionApp.reiniciar();
  });

  describe('getInstance', () => {
    it('devuelve la misma referencia en llamadas sucesivas (===)', () => {
      aplicarEntorno(entornoMinimo());
      const primera = ConfiguracionApp.getInstance();
      const segunda = ConfiguracionApp.getInstance();
      expect(primera).toBe(segunda);
    });

    it('valida el entorno una sola vez: cambios posteriores de process.env no se reflejan', () => {
      aplicarEntorno(entornoMinimo({ PUERTO: '4010' }));
      const primera = ConfiguracionApp.getInstance();
      vi.stubEnv('PUERTO', '5555');
      expect(ConfiguracionApp.getInstance().servidor.puerto).toBe(4010);
      expect(primera.servidor.puerto).toBe(4010);
    });

    it('expone los grupos con los valores por defecto del diseno', () => {
      aplicarEntorno(entornoMinimo());
      const cfg = ConfiguracionApp.getInstance();
      expect(cfg.servidor).toMatchObject({ puerto: 3000, zonaHoraria: 'America/Lima', logNivel: 'info' });
      expect(cfg.seguridad).toMatchObject({ jwtExpiraEn: '2h', bcryptCosto: 10, politicaMensajesAuth: 'GENERICA' });
      expect(cfg.seguridad.limites).toMatchObject({ ventanaMin: 15, login: 10, registro: 10, recuperar: 5, restablecer: 10 });
      expect(cfg.reglas).toMatchObject({
        cooldownReporteMin: 30,
        karmaPorReporte: 10,
        karmaPorValidacion: 2,
        karmaReportesPremiadosDia: 5,
        saturacionVentanaMin: 60,
        saturacionMinReportes: 3,
        saturacionUmbralModerado: 1.67,
        saturacionUmbralSaturado: 2.34,
        confiabilidadMinVotos: 3,
        confiabilidadUmbralAlta: 70,
        confiabilidadUmbralMedia: 40,
        topeKarmaPeso: 500,
        radioBusquedaKm: 2,
        suspensionDiasPermitidos: [3, 7, 30],
      });
      expect(cfg.bd).toMatchObject({ host: 'localhost', puerto: 5432, password: 'clave-bd' });
      expect(cfg.correo.proveedor).toBe('consola');
      expect(cfg.push.proveedor).toBe('consola');
      expect(cfg.semillas.demo).toBe(false);
    });

    it('lee las claves del entorno: lista de CORS, dias de suspension y numeros', () => {
      aplicarEntorno(
        entornoMinimo({
          CORS_ORIGENES: 'http://a.pe, http://b.pe',
          SUSPENSION_DIAS_PERMITIDOS: '1,2',
          COOLDOWN_REPORTE_MIN: '45',
          SEED_DEMO: 'true',
        }),
      );
      const cfg = ConfiguracionApp.getInstance();
      expect(cfg.servidor.corsOrigenes).toEqual(['http://a.pe', 'http://b.pe']);
      expect(cfg.reglas.suspensionDiasPermitidos).toEqual([1, 2]);
      expect(cfg.reglas.cooldownReporteMin).toBe(45);
      expect(cfg.semillas.demo).toBe(true);
    });

    it('los grupos son inmutables', () => {
      aplicarEntorno(entornoMinimo());
      const cfg = ConfiguracionApp.getInstance();
      expect(() => {
        (cfg.seguridad as { bcryptCosto: number }).bcryptCosto = 4;
      }).toThrow(TypeError);
      expect(() => {
        (cfg.seguridad.limites as { login: number }).login = 1;
      }).toThrow(TypeError);
      expect(cfg.seguridad.bcryptCosto).toBe(10);
    });
  });

  describe('fail-fast', () => {
    function capturarSalida() {
      const salida: string[] = [];
      vi.spyOn(process.stderr, 'write').mockImplementation(((texto: string) => {
        salida.push(String(texto));
        return true;
      }) as never);
      const salir = vi.spyOn(process, 'exit').mockImplementation((() => {
        throw new Error('process.exit');
      }) as never);
      return { salida, salir };
    }

    it('JWT_SECRETO ausente: escribe el nombre de la clave y sale con codigo 1', () => {
      aplicarEntorno({ DB_PASSWORD: 'clave-bd' });
      const { salida, salir } = capturarSalida();
      expect(() => ConfiguracionApp.getInstance()).toThrow('process.exit');
      expect(salir).toHaveBeenCalledWith(1);
      expect(salida.join('')).toContain('JWT_SECRETO');
    });

    it('JWT_SECRETO de 31 caracteres es invalido y no se imprime su valor', () => {
      const corto = 'k'.repeat(31);
      aplicarEntorno(entornoMinimo({ JWT_SECRETO: corto }));
      const { salida, salir } = capturarSalida();
      expect(() => ConfiguracionApp.getInstance()).toThrow('process.exit');
      expect(salir).toHaveBeenCalledWith(1);
      expect(salida.join('')).toContain('JWT_SECRETO');
      expect(salida.join('')).not.toContain(corto);
    });

    it('nombra todas las claves invalidas a la vez', () => {
      aplicarEntorno({ PUERTO: 'abc', BCRYPT_COSTO: '99' });
      const { salida } = capturarSalida();
      expect(() => ConfiguracionApp.getInstance()).toThrow('process.exit');
      const texto = salida.join('');
      for (const clave of ['PUERTO', 'BCRYPT_COSTO', 'DB_PASSWORD', 'JWT_SECRETO']) {
        expect(texto).toContain(clave);
      }
    });
  });

  describe('paraPruebas', () => {
    it('refleja el override sin tocar process.env ni el singleton', () => {
      const cfg = ConfiguracionApp.paraPruebas({ BCRYPT_COSTO: 4 });
      expect(cfg.seguridad.bcryptCosto).toBe(4);
      expect(process.env.BCRYPT_COSTO).toBeUndefined();
      aplicarEntorno(entornoMinimo());
      expect(ConfiguracionApp.getInstance()).not.toBe(cfg);
      expect(ConfiguracionApp.getInstance().seguridad.bcryptCosto).toBe(10);
    });

    it('acepta varios overrides y mantiene un entorno valido por defecto', () => {
      const cfg = ConfiguracionApp.paraPruebas({ COOLDOWN_REPORTE_MIN: 1, POLITICA_MENSAJES_AUTH: 'DETALLADA' });
      expect(cfg.reglas.cooldownReporteMin).toBe(1);
      expect(cfg.seguridad.politicaMensajesAuth).toBe('DETALLADA');
      expect(cfg.seguridad.jwtSecreto.length).toBeGreaterThanOrEqual(32);
    });

    it('un override invalido lanza error con el nombre de la clave (sin salir del proceso)', () => {
      expect(() => ConfiguracionApp.paraPruebas({ BCRYPT_COSTO: 1 })).toThrow(/BCRYPT_COSTO/);
    });
  });
});

describe('validarEntorno', () => {
  it('devuelve ok con el valor tipado', () => {
    const resultado = validarEntorno(entornoMinimo({ PUERTO: '8080' }));
    expect(resultado.ok).toBe(true);
    if (resultado.ok) expect(resultado.valor.PUERTO).toBe(8080);
  });

  it('devuelve las claves invalidas sin repetir y ordenadas', () => {
    const resultado = validarEntorno({ PUERTO: '0', JWT_SECRETO: 'corto' });
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.claves).toEqual(['DB_PASSWORD', 'JWT_SECRETO', 'PUERTO']);
  });

  it('trata los valores vacios como ausentes (usa el valor por defecto)', () => {
    const resultado = validarEntorno(entornoMinimo({ PUERTO: '', SMTP_HOST: '' }));
    expect(resultado.ok).toBe(true);
    if (resultado.ok) expect(resultado.valor.PUERTO).toBe(3000);
  });

  it('exige SMTP_HOST, SMTP_USUARIO y SMTP_PASSWORD cuando CORREO_PROVEEDOR=smtp', () => {
    const resultado = validarEntorno(entornoMinimo({ CORREO_PROVEEDOR: 'smtp' }));
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.claves).toEqual(['SMTP_HOST', 'SMTP_PASSWORD', 'SMTP_USUARIO']);
  });

  it('exige FCM_CREDENCIALES_RUTA cuando PUSH_PROVEEDOR=fcm', () => {
    const resultado = validarEntorno(entornoMinimo({ PUSH_PROVEEDOR: 'fcm' }));
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.claves).toEqual(['FCM_CREDENCIALES_RUTA']);
  });
});
