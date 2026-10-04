import { ConfiguracionApp, type SobrescritosEntorno } from '../../src/config/ConfiguracionApp.js';

/** Isolated, valid configuration for tests (cheap bcrypt, silent logs); overrides are env-style keys. */
export const configPrueba = (sobrescritos: SobrescritosEntorno = {}): ConfiguracionApp =>
  ConfiguracionApp.paraPruebas(sobrescritos);
