/** The spies/fakes other streams inject must honour the port contracts they replace. */
import { describe, expect, it } from 'vitest';
import { CorreoEspia } from './CorreoEspia.js';
import { GeneradorTokenFijo } from './GeneradorTokenFijo.js';
import { NotificadorEspia } from './NotificadorEspia.js';
import { RelojFijo } from '../RelojFijo.js';

describe('CorreoEspia', () => {
  it('guarda cada mensaje enviado y puede simular un fallo del proveedor', async () => {
    const correo = new CorreoEspia();
    await correo.enviar({ para: 'a@b.pe', asunto: 'uno', html: '<p>1</p>', texto: '1' });
    expect(correo.enviados.map((m) => m.asunto)).toEqual(['uno']);
    correo.fallo = new Error('SMTP caido');
    await expect(correo.enviar({ para: 'a@b.pe', asunto: 'dos', html: '', texto: '' })).rejects.toThrow('SMTP caido');
    expect(correo.enviados).toHaveLength(1);
  });
});

describe('NotificadorEspia', () => {
  it('registra los envios y devuelve los tokens invalidos configurados', async () => {
    const push = new NotificadorEspia();
    push.invalidos = ['malo'];
    const resultado = await push.enviar(['bueno', 'malo'], { titulo: 't', cuerpo: 'c', data: { lugarId: '1' } });
    expect(resultado).toEqual({ enviados: 1, tokensInvalidos: ['malo'] });
    expect(push.llamadas).toEqual([{ tokens: ['bueno', 'malo'], notificacion: { titulo: 't', cuerpo: 'c', data: { lugarId: '1' } } }]);
  });

  it('puede simular que el adaptador lanza', async () => {
    const push = new NotificadorEspia();
    push.fallo = new Error('FCM caido');
    await expect(push.enviar(['x'], { titulo: 't', cuerpo: 'c' })).rejects.toThrow('FCM caido');
  });
});

describe('GeneradorTokenFijo', () => {
  it('entrega los tokens en el orden dado y el hash es reversible para el test', () => {
    const generador = new GeneradorTokenFijo(['uno', 'dos']);
    expect(generador.generar()).toBe('uno');
    expect(generador.generar()).toBe('dos');
    expect(generador.hashear('uno')).toBe('hash(uno)'.padEnd(64, '0'));
  });
});

describe('RelojFijo', () => {
  it('devuelve siempre la misma hora hasta que se avanza', () => {
    const reloj = new RelojFijo(new Date('2026-10-05T14:00:00Z'));
    expect(reloj.ahora()).toEqual(new Date('2026-10-05T14:00:00Z'));
    reloj.avanzarMinutos(30);
    expect(reloj.ahora()).toEqual(new Date('2026-10-05T14:30:00Z'));
  });
});
