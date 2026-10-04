/** Unit tests of DenunciaServiceImpl (spec M5 R5, S10-S13). */
import { beforeEach, describe, expect, it } from 'vitest';
import type { DenunciaDAO } from '../../src/dao/DenunciaDAO.js';
import { EstadoDenuncia } from '../../src/enum/EstadoDenuncia.js';
import { EstadoReporte } from '../../src/enum/EstadoReporte.js';
import { MotivoDenuncia } from '../../src/enum/MotivoDenuncia.js';
import { CodigoError } from '../../src/exception/CodigoError.js';
import { DenunciaServiceImpl } from '../../src/service/impl/DenunciaServiceImpl.js';
import { RelojFijo } from '../support/RelojFijo.js';
import { DenunciaDAOMemoria } from '../support/dao/memoria/DenunciaDAOMemoria.js';
import { ReporteDAOMemoria } from '../support/dao/memoria/ReporteDAOMemoria.js';
import { aReporte } from '../support/fabrica/datos.js';

const AHORA = new Date('2026-10-05T15:00:00Z');
const AUTOR = 1;
const DENUNCIANTE = 2;

describe('DenunciaServiceImpl.denunciar', () => {
  let reporteDAO: ReporteDAOMemoria;
  let denunciaDAO: DenunciaDAOMemoria;
  let servicio: DenunciaServiceImpl;
  let reporteId: number;

  beforeEach(() => {
    reporteDAO = new ReporteDAOMemoria();
    denunciaDAO = new DenunciaDAOMemoria();
    servicio = new DenunciaServiceImpl({ reporteDAO, denunciaDAO, reloj: new RelojFijo(AHORA) });
    reporteId = reporteDAO.agregar(aReporte({ usuarioId: AUTOR })).id;
  });

  it('crea la denuncia PENDIENTE con la hora del reloj (S10)', async () => {
    const denuncia = await servicio.denunciar(DENUNCIANTE, reporteId, MotivoDenuncia.INFORMACION_FALSA, null);
    expect(denuncia).toMatchObject({
      reporteId,
      usuarioId: DENUNCIANTE,
      motivo: 'INFORMACION_FALSA',
      detalle: null,
      estado: EstadoDenuncia.PENDIENTE,
      fechaHora: AHORA,
    });
    expect(await denunciaDAO.existe(DENUNCIANTE, reporteId)).toBe(true);
  });

  it('OTRO guarda el detalle sin espacios sobrantes', async () => {
    const denuncia = await servicio.denunciar(DENUNCIANTE, reporteId, MotivoDenuncia.OTRO, '  Reporte repetido  ');
    expect(denuncia.detalle).toBe('Reporte repetido');
  });

  it('OTRO sin detalle (o solo espacios) es 400 VALIDACION_FALLIDA y no guarda nada (S11)', async () => {
    for (const detalle of [null, '', '   ']) {
      await expect(servicio.denunciar(DENUNCIANTE, reporteId, MotivoDenuncia.OTRO, detalle)).rejects.toMatchObject({
        status: 400,
        code: CodigoError.VALIDACION_FALLIDA,
        errors: [{ campo: 'detalle', mensaje: expect.any(String) }],
      });
    }
    expect(await denunciaDAO.existe(DENUNCIANTE, reporteId)).toBe(false);
  });

  it('denunciar dos veces el mismo reporte es 409 DENUNCIA_DUPLICADA (S12)', async () => {
    await servicio.denunciar(DENUNCIANTE, reporteId, MotivoDenuncia.SPAM, null);
    await expect(servicio.denunciar(DENUNCIANTE, reporteId, MotivoDenuncia.OTRO, 'otra vez')).rejects.toMatchObject({
      status: 409,
      code: CodigoError.DENUNCIA_DUPLICADA,
    });
  });

  it('una denuncia simultanea que pierde la carrera tambien es 409', async () => {
    await servicio.denunciar(DENUNCIANTE, reporteId, MotivoDenuncia.SPAM, null);
    // the second request passed the `existe` check before the first one saved
    const ciego: Pick<DenunciaDAO, 'existe' | 'crear'> = { existe: async () => false, crear: (datos) => denunciaDAO.crear(datos) };
    servicio = new DenunciaServiceImpl({ reporteDAO, denunciaDAO: ciego, reloj: new RelojFijo(AHORA) });
    await expect(servicio.denunciar(DENUNCIANTE, reporteId, MotivoDenuncia.SPAM, null)).rejects.toMatchObject({
      code: CodigoError.DENUNCIA_DUPLICADA,
    });
  });

  it('denunciar el propio reporte es 422 AUTODENUNCIA_NO_PERMITIDA (S13)', async () => {
    await expect(servicio.denunciar(AUTOR, reporteId, MotivoDenuncia.SPAM, null)).rejects.toMatchObject({
      status: 422,
      code: CodigoError.AUTODENUNCIA_NO_PERMITIDA,
    });
  });

  it('un reporte inexistente o eliminado es 404 REPORTE_NO_ENCONTRADO (S13)', async () => {
    await expect(servicio.denunciar(DENUNCIANTE, 9999, MotivoDenuncia.SPAM, null)).rejects.toMatchObject({
      status: 404,
      code: CodigoError.REPORTE_NO_ENCONTRADO,
    });
    const eliminado = reporteDAO.agregar(aReporte({ usuarioId: AUTOR, estado: EstadoReporte.ELIMINADO })).id;
    await expect(servicio.denunciar(DENUNCIANTE, eliminado, MotivoDenuncia.SPAM, null)).rejects.toMatchObject({ status: 404 });
  });
});
