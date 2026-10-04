/** Unit tests of ReporteServiceImpl: cooldown, creation and own-report listing (spec M4 R2, R7, S4, S5). */
import { beforeEach, describe, expect, it } from 'vitest';
import type { ContextoTx } from '../../src/datasource/ConexionBD.js';
import { EstadoReporte } from '../../src/enum/EstadoReporte.js';
import { NivelSaturacion } from '../../src/enum/NivelSaturacion.js';
import { CodigoError } from '../../src/exception/CodigoError.js';
import { ReporteEnEsperaException } from '../../src/exception/reporte/ReporteEnEsperaException.js';
import { ReporteServiceImpl } from '../../src/service/impl/ReporteServiceImpl.js';
import { RelojFijo } from '../support/RelojFijo.js';
import { ReporteDAOMemoria } from '../support/dao/memoria/ReporteDAOMemoria.js';

const T0 = new Date('2026-10-05T15:00:00Z');
const TX = {} as ContextoTx;
const USUARIO = 1;
const LUGAR = 7;

describe('ReporteServiceImpl', () => {
  let reloj: RelojFijo;
  let dao: ReporteDAOMemoria;
  let servicio: ReporteServiceImpl;

  beforeEach(() => {
    reloj = new RelojFijo(T0);
    dao = new ReporteDAOMemoria();
    servicio = new ReporteServiceImpl({ reporteDAO: dao, reloj, cooldownMin: 30 });
  });

  const reportar = (usuarioId = USUARIO, lugarId = LUGAR) => servicio.crear(usuarioId, lugarId, NivelSaturacion.MODERADO, TX);

  describe('validarCooldown', () => {
    it('sin reportes previos permite reportar', async () => {
      await expect(servicio.validarCooldown(USUARIO, LUGAR, TX)).resolves.toBeUndefined();
    });

    it('a los 29:59 del ultimo reporte lanza 422 REPORTE_EN_ESPERA', async () => {
      await reportar();
      reloj.avanzarMinutos(29.9833333333); // 29 min 59 s
      const error = await servicio.validarCooldown(USUARIO, LUGAR, TX).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(ReporteEnEsperaException);
      expect(error).toMatchObject({ status: 422, code: CodigoError.REPORTE_EN_ESPERA });
    });

    it('a los 30:00 exactos ya permite reportar', async () => {
      await reportar();
      reloj.avanzarMinutos(30);
      await expect(servicio.validarCooldown(USUARIO, LUGAR, TX)).resolves.toBeUndefined();
    });

    it('el mensaje dice cuantos minutos faltan, redondeando hacia arriba', async () => {
      await reportar();
      reloj.avanzarMinutos(5);
      await expect(servicio.validarCooldown(USUARIO, LUGAR, TX)).rejects.toThrow(
        'Ya reportaste este lugar. Vuelve a intentarlo en 25 minutos.',
      );
      reloj.avanzarMinutos(24.5); // 30 s left
      await expect(servicio.validarCooldown(USUARIO, LUGAR, TX)).rejects.toThrow(
        'Ya reportaste este lugar. Vuelve a intentarlo en 1 minuto.',
      );
    });

    it('otro lugar u otro usuario no se ven afectados', async () => {
      await reportar();
      await expect(servicio.validarCooldown(USUARIO, LUGAR + 1, TX)).resolves.toBeUndefined();
      await expect(servicio.validarCooldown(USUARIO + 1, LUGAR, TX)).resolves.toBeUndefined();
    });

    it('cuenta un reporte ELIMINADO: el cooldown mira cualquier estado', async () => {
      const previo = await reportar();
      await dao.actualizarEstado(previo.id, EstadoReporte.ELIMINADO);
      await expect(servicio.validarCooldown(USUARIO, LUGAR, TX)).rejects.toBeInstanceOf(ReporteEnEsperaException);
    });

    it('la ventana sale de la configuracion', async () => {
      servicio = new ReporteServiceImpl({ reporteDAO: dao, reloj, cooldownMin: 10 });
      await reportar();
      reloj.avanzarMinutos(10);
      await expect(servicio.validarCooldown(USUARIO, LUGAR, TX)).resolves.toBeUndefined();
    });
  });

  describe('crear', () => {
    it('guarda un reporte ACTIVO con la hora del reloj inyectado', async () => {
      const creado = await servicio.crear(USUARIO, LUGAR, NivelSaturacion.SATURADO, TX);
      expect(creado).toMatchObject({
        usuarioId: USUARIO,
        lugarId: LUGAR,
        nivelSaturacion: 'SATURADO',
        estado: 'ACTIVO',
        fechaHora: T0,
      });
      expect(await dao.buscarPorId(creado.id)).toMatchObject({ nivelSaturacion: 'SATURADO' });
    });
  });

  describe('listarMios', () => {
    it('devuelve solo los del usuario, el mas nuevo primero', async () => {
      const a = await reportar();
      reloj.avanzarMinutos(40);
      const b = await reportar(USUARIO, LUGAR + 1);
      await reportar(USUARIO + 1, LUGAR);
      expect((await servicio.listarMios(USUARIO)).map((r) => r.id)).toEqual([b.id, a.id]);
    });

    it('un usuario sin reportes recibe lista vacia', async () => {
      await reportar();
      expect(await servicio.listarMios(USUARIO + 99)).toEqual([]);
    });
  });
});
