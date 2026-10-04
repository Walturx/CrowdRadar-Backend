/** Console adapters are the default providers (CORREO_PROVEEDOR=consola, PUSH_PROVEEDOR=consola): they log instead of sending. */
import { describe, expect, it } from 'vitest';
import { ConsolaCorreoAdapter } from '../../src/adapter/correo/impl/ConsolaCorreoAdapter.js';
import { ConsolaNotificadorAdapter } from '../../src/adapter/push/impl/ConsolaNotificadorAdapter.js';
import { crearLoggerEspia } from '../support/LoggerEspia.js';

describe('ConsolaCorreoAdapter', () => {
  const mensaje = {
    para: 'walter@kamailab.com',
    asunto: 'Restablece tu contrasena',
    html: '<p><a href="http://localhost:3000/recuperar/restablecer?token=abcdef123456">enlace</a></p>',
    texto: 'Abre http://localhost:3000/recuperar/restablecer?token=abcdef123456 y listo',
  };

  it('logs the recipient masked, the subject and the link with the token masked, never the token (R1-1301)', async () => {
    const { logger, lineas } = crearLoggerEspia();
    await new ConsolaCorreoAdapter(logger).enviar(mensaje);
    expect(lineas).toHaveLength(1);
    expect(lineas[0]).toMatchObject({
      para: 'w*****@kamailab.com',
      asunto: 'Restablece tu contrasena',
      enlace: 'http://localhost:3000/recuperar/restablecer?token=••••3456',
    });
    const salida = JSON.stringify(lineas);
    expect(salida).not.toContain('abcdef123456');
    expect(salida).not.toContain('walter@');
    expect(lineas[0]).not.toHaveProperty('texto');
    expect(lineas[0]).not.toHaveProperty('html');
  });

  it('masks a different token the same way (triangulation)', async () => {
    const { logger, lineas } = crearLoggerEspia();
    await new ConsolaCorreoAdapter(logger).enviar({ ...mensaje, texto: 'http://h.test/x?token=ZZZZ-9876' });
    expect(lineas[0]).toMatchObject({ enlace: 'http://h.test/x?token=••••9876' });
  });

  it('CORREO_MOSTRAR_ENLACE_DEV: one extra line carries the full link (development only)', async () => {
    const { logger, lineas } = crearLoggerEspia();
    await new ConsolaCorreoAdapter(logger, { mostrarEnlace: true }).enviar(mensaje);
    expect(lineas).toHaveLength(2);
    expect(lineas[1]).toMatchObject({ enlace: 'http://localhost:3000/recuperar/restablecer?token=abcdef123456' });
    expect(lineas[0]).not.toHaveProperty('texto');
    expect(JSON.stringify(lineas[0])).not.toContain('abcdef123456');
  });
});

describe('ConsolaNotificadorAdapter', () => {
  it('cuenta un envio por token, no marca ninguno invalido y registra el payload', async () => {
    const { logger, lineas } = crearLoggerEspia();
    const resultado = await new ConsolaNotificadorAdapter(logger).enviar(['t1', 't2', 't3'], {
      titulo: 'Parque Kennedy',
      cuerpo: 'Ahora esta Saturado',
      data: { lugarId: '7' },
    });
    expect(resultado).toEqual({ enviados: 3, tokensInvalidos: [] });
    expect(lineas[0]).toMatchObject({ titulo: 'Parque Kennedy', destinatarios: 3, data: { lugarId: '7' } });
    expect(JSON.stringify(lineas[0])).not.toContain('t1');
  });

  it('sin tokens no envia nada', async () => {
    const { logger } = crearLoggerEspia();
    expect(await new ConsolaNotificadorAdapter(logger).enviar([], { titulo: 'x', cuerpo: 'y' })).toEqual({
      enviados: 0,
      tokensInvalidos: [],
    });
  });
});
