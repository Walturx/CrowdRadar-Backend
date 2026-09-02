import { ConfiguracionApp } from '../../src/config/ConfiguracionApp.js';
import { esquemaEntorno, validarEntorno, type Entorno } from '../../src/config/esquemaEntorno.js';

/** Overrides keyed by environment variable name. */
export type SobrescritosEntorno = Partial<Record<keyof typeof esquemaEntorno.shape, string | number | boolean>>;

/** Valid baseline for tests: cheap bcrypt, silent logs, no real secrets. */
const ENTORNO_PRUEBAS: Record<string, string> = {
  DB_PASSWORD: 'prueba',
  JWT_SECRETO: 'p'.repeat(48),
  BCRYPT_COSTO: '4',
  LOG_NIVEL: 'silent',
};

/** ConfiguracionApp keeps its constructor private so production code can only go through getInstance(). */
type ConstructorConfiguracion = new (env: Entorno) => ConfiguracionApp;

/**
 * Isolated, valid configuration for tests: never reads or writes process.env and never exits.
 * An invalid override throws with the offending key name.
 */
export function configPrueba(sobrescritos: SobrescritosEntorno = {}): ConfiguracionApp {
  const texto = Object.fromEntries(Object.entries(sobrescritos).map(([clave, valor]) => [clave, String(valor)]));
  const resultado = validarEntorno({ ...ENTORNO_PRUEBAS, ...texto });
  if (!resultado.ok) throw new Error(resultado.mensaje);
  return new (ConfiguracionApp as unknown as ConstructorConfiguracion)(resultado.valor);
}
