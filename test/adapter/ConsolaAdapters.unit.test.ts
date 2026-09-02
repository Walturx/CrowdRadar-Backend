/** Console adapters are the default providers (CORREO_PROVEEDOR=consola, PUSH_PROVEEDOR=consola): they log instead of sending. */
import { describe, expect, it } from 'vitest';
import { ConsolaCorreoAdapter } from '../../src/adapter/correo/impl/ConsolaCorreoAdapter.js';
import { ConsolaNotificadorAdapter } from '../../src/adapter/push/impl/ConsolaNotificadorAdapter.js';
import { crearLoggerEspia } from '../support/LoggerEspia.js';

describe('ConsolaCorreoAdapter', () => {
  it('registra destinatario, asunto y texto (para seguir el enlace en desarrollo) y resuelve', async () => {
    const { logger, lineas } = crearLoggerEspia();
    await new ConsolaCorreoAdapter(logger).enviar({
      para: 'ana@crowdradar.pe',
      asunto: 'Restablece tu contrasena',
      html: '<p>Hola</p>',
      texto: 'Abre http://localhost:3000/recuperar/restablecer?token=abc',
    });
    expect(lineas).toHaveLength(1);
    expect(lineas[0]).toMatchObject({
      para: 'ana@crowdradar.pe',
      asunto: 'Restablece tu contrasena',
      texto: 'Abre http://localhost:3000/recuperar/restablecer?token=abc',
    });
    expect(lineas[0]).not.toHaveProperty('html');
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
