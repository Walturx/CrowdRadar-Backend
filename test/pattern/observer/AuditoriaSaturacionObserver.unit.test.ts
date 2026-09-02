import { describe, expect, it } from 'vitest';
import { AuditoriaSaturacionObserver } from '../../../src/pattern/observer/AuditoriaSaturacionObserver.js';
import { crearEventoSaturacion } from '../../../src/pattern/observer/SaturacionCambiadaEvento.js';
import { crearLoggerEspia } from '../../support/LoggerEspia.js';

describe('AuditoriaSaturacionObserver', () => {
  it('registra un cambio de nivel con lugar, niveles y autor', async () => {
    const { logger, lineas } = crearLoggerEspia();
    const auditoria = new AuditoriaSaturacionObserver(logger);
    await auditoria.alRecibir(
      crearEventoSaturacion({ lugarId: 9, nivelAnterior: 'TRANQUILO', nivelNuevo: 'MODERADO', autorId: 4, ocurridoEn: new Date('2026-10-05T14:00:00Z') }),
    );
    expect(auditoria.nombre).toBe('auditoria-saturacion');
    expect(lineas).toHaveLength(1);
    expect(lineas[0]).toMatchObject({ level: 30, lugarId: 9, nivelAnterior: 'TRANQUILO', nivelNuevo: 'MODERADO', autorId: 4, msg: 'Cambio de saturacion' });
  });

  it('registra tambien cuando el nivel anterior es null', async () => {
    const { logger, lineas } = crearLoggerEspia();
    await new AuditoriaSaturacionObserver(logger).alRecibir(
      crearEventoSaturacion({ lugarId: 2, nivelAnterior: null, nivelNuevo: 'SATURADO', autorId: 1, ocurridoEn: new Date() }),
    );
    expect(lineas[0]).toMatchObject({ lugarId: 2, nivelAnterior: null, nivelNuevo: 'SATURADO' });
  });
});
