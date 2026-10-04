/**
 * Environment keys added for runtime hardening and secret hygiene: pool and timeouts, boot retry,
 * placeholder rejection (R1-207), suspension days vs the migration CHECK (R3-202), JWT expiry format.
 */
import { describe, expect, it } from 'vitest';
import { validarEntorno } from '../../src/config/esquemaEntorno.js';
import { configPrueba } from '../support/configPrueba.js';

const base = { DB_PASSWORD: 'clave-bd', JWT_SECRETO: 'j'.repeat(40) };
const claves = (env: Record<string, string>) => {
  const r = validarEntorno({ ...base, ...env });
  return r.ok ? [] : r.claves;
};

describe('valores por defecto de runtime', () => {
  it('pool, statement_timeout, reintentos de arranque y timeouts del servidor', () => {
    const cfg = configPrueba();
    expect(cfg.bd).toMatchObject({
      pool: { max: 10, min: 0, acquireMs: 30000, idleMs: 10000 },
      statementTimeoutMs: 15000,
      reintentos: 5,
      reintentoEsperaMs: 500,
    });
    expect(cfg.servidor.timeouts).toEqual({ requestMs: 30000, headersMs: 66000, keepAliveMs: 65000, apagadoMs: 35000 });
  });

  it('se pueden sobrescribir desde el entorno', () => {
    const cfg = configPrueba({ DB_POOL_MAX: 3, DB_STATEMENT_TIMEOUT_MS: 2000, DB_REINTENTOS: 2, APAGADO_TIMEOUT_MS: 40000 });
    expect(cfg.bd.pool.max).toBe(3);
    expect(cfg.bd.statementTimeoutMs).toBe(2000);
    expect(cfg.bd.reintentos).toBe(2);
    expect(cfg.servidor.timeouts.apagadoMs).toBe(40000);
  });
});

describe('coherencia entre claves', () => {
  it('DB_POOL_MIN no puede superar DB_POOL_MAX', () => {
    expect(claves({ DB_POOL_MIN: '5', DB_POOL_MAX: '2' })).toContain('DB_POOL_MIN');
    expect(claves({ DB_POOL_MIN: '2', DB_POOL_MAX: '2' })).toEqual([]);
  });

  it('headersTimeout debe superar keepAliveTimeout (R4-416: evita cortar conexiones keep-alive ociosas)', () => {
    expect(claves({ SERVIDOR_HEADERS_TIMEOUT_MS: '60000', SERVIDOR_KEEPALIVE_TIMEOUT_MS: '65000' })).toContain(
      'SERVIDOR_HEADERS_TIMEOUT_MS',
    );
    expect(claves({ SERVIDOR_HEADERS_TIMEOUT_MS: '65000', SERVIDOR_KEEPALIVE_TIMEOUT_MS: '65000' })).toContain(
      'SERVIDOR_HEADERS_TIMEOUT_MS',
    );
    expect(claves({ SERVIDOR_HEADERS_TIMEOUT_MS: '66000', SERVIDOR_KEEPALIVE_TIMEOUT_MS: '65000' })).toEqual([]);
  });

  it('APAGADO_TIMEOUT_MS debe superar SERVIDOR_REQUEST_TIMEOUT_MS para no cortar peticiones en vuelo (R4-410)', () => {
    expect(claves({ APAGADO_TIMEOUT_MS: '30000', SERVIDOR_REQUEST_TIMEOUT_MS: '30000' })).toContain('APAGADO_TIMEOUT_MS');
    expect(claves({ APAGADO_TIMEOUT_MS: '10000' })).toContain('APAGADO_TIMEOUT_MS');
    expect(claves({ APAGADO_TIMEOUT_MS: '30001', SERVIDOR_REQUEST_TIMEOUT_MS: '30000' })).toEqual([]);
    expect(claves({})).toEqual([]);
  });

  it('DB_REINTENTOS exige al menos 1 intento', () => {
    expect(claves({ DB_REINTENTOS: '0' })).toContain('DB_REINTENTOS');
  });
});

describe('SERVIDOR_LIMITE_CUERPO (R2-402)', () => {
  it('por defecto es 100kb y se expone en la configuracion', () => {
    expect(configPrueba().servidor.limiteCuerpo).toBe('100kb');
  });

  it.each(['1mb', '500kb', '2048b', '1MB'])('acepta %s', (valor) => {
    expect(claves({ SERVIDOR_LIMITE_CUERPO: valor })).toEqual([]);
    expect(configPrueba({ SERVIDOR_LIMITE_CUERPO: valor }).servidor.limiteCuerpo).toBe(valor);
  });

  it.each(['grande', '0kb', '-1kb', '100', '1gb', '1.5mb'])('rechaza %s y nombra la clave', (valor) => {
    expect(claves({ SERVIDOR_LIMITE_CUERPO: valor })).toEqual(['SERVIDOR_LIMITE_CUERPO']);
  });
});

describe('ventana de limites (R2-403)', () => {
  it('la configuracion expone la ventana en milisegundos', () => {
    expect(configPrueba().seguridad.limites.ventanaMs).toBe(15 * 60 * 1000);
    expect(configPrueba({ LIMITE_VENTANA_MIN: 2 }).seguridad.limites.ventanaMs).toBe(120_000);
  });
});

describe('SUSPENSION_DIAS_PERMITIDOS frente al CHECK dias IN (3,7,30) de sancion_usuario', () => {
  it.each(['3,7,30', '7,3', '30', '3'])('acepta %s (subconjunto de 3,7,30)', (valor) => {
    expect(claves({ SUSPENSION_DIAS_PERMITIDOS: valor })).toEqual([]);
  });

  it.each(['1,2', '3,5', '14', '3,7,30,60'])('rechaza %s y nombra la clave', (valor) => {
    const r = validarEntorno({ ...base, SUSPENSION_DIAS_PERMITIDOS: valor });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.claves).toContain('SUSPENSION_DIAS_PERMITIDOS');
      expect(r.mensaje).toContain('3, 7, 30');
    }
  });
});

describe('JWT_EXPIRA_EN', () => {
  it.each(['2h', '15m', '7d', '90s'])('acepta %s', (valor) => {
    expect(claves({ JWT_EXPIRA_EN: valor })).toEqual([]);
  });

  it.each(['dos horas', '3600', '0h', '-1h', ''])('rechaza "%s" cuando se informa', (valor) => {
    // an empty value counts as absent (default 2h), so only non-empty values must fail
    const esperado = valor === '' ? [] : ['JWT_EXPIRA_EN'];
    expect(claves({ JWT_EXPIRA_EN: valor })).toEqual(esperado);
  });
});

describe('placeholders de .env.example (R1-207)', () => {
  it.each(['DB_PASSWORD', 'JWT_SECRETO'] as const)('%s que empieza con CAMBIAR es invalido', (clave) => {
    const valor = `CAMBIAR_${'x'.repeat(40)}`;
    expect(claves({ ...base, [clave]: valor })).toContain(clave);
  });

  it('ADMIN_PASSWORD con placeholder o de menos de 10 caracteres es invalido; una real es valida', () => {
    expect(claves({ ADMIN_PASSWORD: 'CAMBIAR_PASSWORD_ADMIN' })).toContain('ADMIN_PASSWORD');
    expect(claves({ ADMIN_PASSWORD: 'Corta123' })).toContain('ADMIN_PASSWORD');
    expect(claves({ ADMIN_PASSWORD: 'UnaClaveLarga123' })).toEqual([]);
  });

  it('el mensaje de error no repite el valor del secreto', () => {
    const r = validarEntorno({ ...base, JWT_SECRETO: `CAMBIAR_${'z'.repeat(40)}` });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.mensaje).not.toContain('zzzz');
  });
});

describe('lugares: limites de la busqueda y zona horaria', () => {
  it('LUGARES_Q_MIN no puede superar LUGARES_Q_MAX ni LUGARES_LIMITE_DEFAULT a LUGARES_LIMITE_MAX', () => {
    expect(claves({ LUGARES_Q_MIN: '10', LUGARES_Q_MAX: '5' })).toEqual(['LUGARES_Q_MIN']);
    expect(claves({ LUGARES_LIMITE_MAX: '50', LUGARES_LIMITE_DEFAULT: '60' })).toEqual(['LUGARES_LIMITE_DEFAULT']);
    expect(claves({ LUGARES_Q_MIN: '0' })).toEqual(['LUGARES_Q_MIN']);
    expect(claves({ LUGARES_LIMITE_MAX: '0' })).toContain('LUGARES_LIMITE_MAX');
  });

  it('ZONA_HORARIA debe ser un identificador IANA conocido (America/Lima, UTC), no un texto cualquiera', () => {
    expect(claves({ ZONA_HORARIA: 'America/Lima' })).toEqual([]);
    expect(claves({ ZONA_HORARIA: 'UTC' })).toEqual([]);
    expect(claves({ ZONA_HORARIA: 'Lima/Peru' })).toEqual(['ZONA_HORARIA']);
    expect(claves({ ZONA_HORARIA: 'no es una zona' })).toEqual(['ZONA_HORARIA']);
  });
});
