/**
 * Operational limits of the report and alert flow: lock timeout per connection, event delivery budget, alert fan-out
 * concurrency, push timeout and device cap per user. Each one has a safe default and rejects values below 1.
 */
import { describe, expect, it } from 'vitest';
import { validarEntorno } from '../../src/config/esquemaEntorno.js';
import { opcionesSequelize } from '../../src/datasource/impl/ConexionPostgresFactory.js';
import { configPrueba } from '../support/configPrueba.js';
import { crearLoggerSilencioso } from '../support/LoggerSilencioso.js';

const base = { DB_PASSWORD: 'clave-bd', JWT_SECRETO: 'j'.repeat(40) };
const claves = (env: Record<string, string>) => {
  const r = validarEntorno({ ...base, ...env });
  return r.ok ? [] : r.claves;
};

describe('limites operativos: valores por defecto y sobrescritura', () => {
  it('por defecto: lock 5 s, presupuesto de eventos 500 ms, 5 alertas a la vez, push 3 s, 10 dispositivos por usuario', () => {
    const cfg = configPrueba();
    expect(cfg.bd.lockTimeoutMs).toBe(5000);
    expect(cfg.reglas.eventosPresupuestoMs).toBe(500);
    expect(cfg.reglas.alertasConcurrencia).toBe(5);
    expect(cfg.push.timeoutMs).toBe(3000);
    expect(cfg.reglas.dispositivosMaxPorUsuario).toBe(10);
  });

  it('se sobrescriben desde el entorno', () => {
    const cfg = configPrueba({
      DB_LOCK_TIMEOUT_MS: 1200,
      EVENTOS_PRESUPUESTO_MS: 250,
      ALERTAS_CONCURRENCIA: 2,
      PUSH_TIMEOUT_MS: 900,
      DISPOSITIVOS_MAX_POR_USUARIO: 3,
    });
    expect(cfg.bd.lockTimeoutMs).toBe(1200);
    expect(cfg.reglas.eventosPresupuestoMs).toBe(250);
    expect(cfg.reglas.alertasConcurrencia).toBe(2);
    expect(cfg.push.timeoutMs).toBe(900);
    expect(cfg.reglas.dispositivosMaxPorUsuario).toBe(3);
  });

  it.each(['DB_LOCK_TIMEOUT_MS', 'EVENTOS_PRESUPUESTO_MS', 'ALERTAS_CONCURRENCIA', 'PUSH_TIMEOUT_MS', 'DISPOSITIVOS_MAX_POR_USUARIO'])(
    '%s rechaza 0 y nombra la clave',
    (clave) => {
      expect(claves({ [clave]: '0' })).toEqual([clave]);
      expect(claves({ [clave]: '1' })).toEqual([]);
    },
  );
});

describe('lock_timeout por conexion', () => {
  it('se aplica a cada conexion junto al statement_timeout', () => {
    const o = opcionesSequelize(configPrueba({ DB_LOCK_TIMEOUT_MS: 2500 }).bd, crearLoggerSilencioso());
    expect(o.dialectOptions).toMatchObject({ lock_timeout: 2500, statement_timeout: 15000 });
  });
});
