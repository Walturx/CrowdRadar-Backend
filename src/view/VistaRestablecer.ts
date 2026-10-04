import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

export type EstadoVista = 'formulario' | 'enlace-invalido';

export interface PaginaRenderizada {
  html: string;
  /** Content-Security-Policy for this page: the only script allowed is its own inline one, by hash. */
  csp: string;
}

/** Renders `restablecer.html` for a state: the server decides, from the token, whether the form exists at all. */
export interface VistaRestablecer {
  renderizar(estado: EstadoVista): PaginaRenderizada;
}

/** Located next to this module: `src/view` in development (tsx, vitest) and `dist/view` once built (the build copies it). */
const RUTA_PLANTILLA = new URL('./restablecer.html', import.meta.url);

const BLOQUE = /[ \t]*<!-- estado:([a-z-]+) -->\s*([\s\S]*?)\s*<!-- \/estado -->\r?\n?/g;
const SCRIPT = /<script>([\s\S]*?)<\/script>/;

/** Keeps only the block of `estado` and drops the others (so an invalid link has no form in its HTML at all). */
function elegirBloque(plantilla: string, estado: EstadoVista): string {
  return plantilla.replace(BLOQUE, (_bloque, nombre: string, contenido: string) => (nombre === estado ? `${contenido}\n` : ''));
}

function cspDe(html: string): string {
  const script = SCRIPT.exec(html)?.[1];
  // The hash binds the policy to the exact inline script; a page without script allows none.
  const scripts = script === undefined ? "'none'" : `'sha256-${createHash('sha256').update(script).digest('base64')}'`;
  return `default-src 'none'; script-src ${scripts}; style-src 'unsafe-inline'; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'`;
}

/** Reads the template once (fails fast at assembly when the file is missing from the deployment). */
export function cargarVistaRestablecer(ruta: URL = RUTA_PLANTILLA): VistaRestablecer {
  const plantilla = readFileSync(ruta, 'utf8');
  return {
    renderizar(estado) {
      const html = elegirBloque(plantilla, estado);
      return { html, csp: cspDe(html) };
    },
  };
}
