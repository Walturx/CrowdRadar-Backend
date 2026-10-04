/** Extra redaction paths (review R1-206): SQL text/bind values, driver errors and cookies never reach the logs. */
import { describe, expect, it } from 'vitest';
import { crearLogger } from '../../src/util/logger.js';

function escribir(objeto: Record<string, unknown>): string {
  const lineas: string[] = [];
  crearLogger('info', { write: (linea: string) => void lineas.push(linea) }).info(objeto, 'evento');
  return lineas.join('');
}

describe('crearLogger: redaccion de datos de base de datos y cookies', () => {
  it('redacta err.sql, err.parameters, err.parent y err.original', () => {
    const texto = escribir({
      err: {
        message: 'fallo',
        sql: "INSERT INTO usuario (email) VALUES ('ana@secreto.pe')",
        parameters: ['ana@secreto.pe', '$2b$hash'],
        parent: { detail: 'Key (email)=(ana@secreto.pe) already exists.' },
        original: { detail: 'Key (email)=(ana@secreto.pe) already exists.' },
      },
    });
    expect(texto).toContain('fallo');
    expect(texto).not.toContain('secreto');
    expect(texto).not.toContain('$2b$hash');
  });

  it('redacta cookies de la peticion y set-cookie de la respuesta', () => {
    const texto = escribir({
      req: { headers: { cookie: 'sid=abc123', 'user-agent': 'agente-visible' } },
      res: { headers: { 'set-cookie': ['sid=zzz999'], 'content-type': 'json-visible' } },
    });
    expect(texto).toContain('agente-visible');
    expect(texto).toContain('json-visible');
    expect(texto).not.toContain('abc123');
    expect(texto).not.toContain('zzz999');
  });
});
