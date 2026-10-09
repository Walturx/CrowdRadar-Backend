/** Shared contract for DenunciaDAO (M5 creates, M6 resolves). Design 4.5, 4.7: unique (reporte, usuario), OTRO needs detalle. */
import { beforeEach, describe, expect, it } from 'vitest';
import type { DenunciaDAO } from '../../src/dao/DenunciaDAO.js';
import { EstadoDenuncia } from '../../src/enum/EstadoDenuncia.js';
import { MotivoDenuncia } from '../../src/enum/MotivoDenuncia.js';
import { ConflictoException } from '../../src/exception/http/ConflictoException.js';
import type { Sembrador } from './Sembrador.js';

export interface EntornoDenunciaDAO {
  dao: DenunciaDAO;
  sembrador: Sembrador;
}

const T0 = new Date('2026-10-05T14:00:00Z');
const minutos = (n: number) => new Date(T0.getTime() + n * 60_000);

export function contratoDenunciaDAO(nombre: string, crearEntorno: () => Promise<EntornoDenunciaDAO>): void {
  describe(`DenunciaDAO contract: ${nombre}`, () => {
    let entorno: EntornoDenunciaDAO;
    let autorId: number;
    beforeEach(async () => {
      entorno = await crearEntorno();
      autorId = await entorno.sembrador.usuario();
    });

    const reporteDelAutor = async () => entorno.sembrador.reporte(autorId, await entorno.sembrador.lugar());
    const denunciar = async (reporteId: number, motivo: MotivoDenuncia, fecha = T0, usuarioId?: number) =>
      entorno.dao.crear({
        reporteId,
        usuarioId: usuarioId ?? (await entorno.sembrador.usuario()),
        motivo,
        detalle: motivo === MotivoDenuncia.OTRO ? 'Texto libre' : null,
        fechaHora: fecha,
      });

    it('crea PENDIENTE y existe(usuario, reporte) lo refleja', async () => {
      const reporteId = await reporteDelAutor();
      const denuncia = await denunciar(reporteId, MotivoDenuncia.SPAM);
      expect(denuncia).toMatchObject({ reporteId, motivo: 'SPAM', estado: 'PENDIENTE', detalle: null, resueltaPor: null });
      expect(await entorno.dao.existe(denuncia.usuarioId, reporteId)).toBe(true);
      expect(await entorno.dao.existe(denuncia.usuarioId + 1, reporteId)).toBe(false);
    });

    it('rechaza una segunda denuncia del mismo usuario al mismo reporte', async () => {
      const reporteId = await reporteDelAutor();
      const primera = await denunciar(reporteId, MotivoDenuncia.SPAM);
      await expect(denunciar(reporteId, MotivoDenuncia.OTRO, T0, primera.usuarioId)).rejects.toBeInstanceOf(
        ConflictoException,
      );
    });

    it('listarReportesConPendientes agrupa por reporte y ordena por pendientes y recencia', async () => {
      const unaDenuncia = await reporteDelAutor();
      const dosDenuncias = await reporteDelAutor();
      await denunciar(unaDenuncia, MotivoDenuncia.SPAM, minutos(30));
      await denunciar(dosDenuncias, MotivoDenuncia.SPAM, minutos(1));
      await denunciar(dosDenuncias, MotivoDenuncia.INFORMACION_FALSA, minutos(2));
      const pagina = await entorno.dao.listarReportesConPendientes({ page: 1, size: 20 });
      expect(pagina.total).toBe(2);
      expect(pagina.items).toEqual([
        { reporteId: dosDenuncias, pendientes: 2, ultimaDenunciaEn: minutos(2) },
        { reporteId: unaDenuncia, pendientes: 1, ultimaDenunciaEn: minutos(30) },
      ]);
    });

    it('resumirMotivos cuenta solo las pendientes del reporte', async () => {
      const reporteId = await reporteDelAutor();
      await denunciar(reporteId, MotivoDenuncia.SPAM);
      await denunciar(reporteId, MotivoDenuncia.SPAM);
      await denunciar(reporteId, MotivoDenuncia.OTRO);
      expect((await entorno.dao.resumirMotivos(reporteId)).sort((a, b) => b.total - a.total)).toEqual([
        { motivo: 'SPAM', total: 2 },
        { motivo: 'OTRO', total: 1 },
      ]);
    });

    it('resolverPendientes cierra solo las pendientes, devuelve cuantas y las saca del listado', async () => {
      const reporteId = await reporteDelAutor();
      const otro = await reporteDelAutor();
      await denunciar(reporteId, MotivoDenuncia.SPAM);
      await denunciar(reporteId, MotivoDenuncia.INFORMACION_FALSA);
      await denunciar(otro, MotivoDenuncia.SPAM);
      const admin = await entorno.sembrador.usuario();
      expect(await entorno.dao.resolverPendientes(reporteId, EstadoDenuncia.PROCEDENTE, admin, minutos(60))).toBe(2);
      expect(await entorno.dao.resolverPendientes(reporteId, EstadoDenuncia.DESESTIMADA, admin, minutos(61))).toBe(0);
      expect(await entorno.dao.resumirMotivos(reporteId)).toEqual([]);
      expect((await entorno.dao.listarReportesConPendientes({ page: 1, size: 20 })).items.map((i) => i.reporteId)).toEqual([otro]);
    });

    it('contarRecibidasPorAutor suma las denuncias a reportes del autor, resueltas o no', async () => {
      const a = await reporteDelAutor();
      const b = await reporteDelAutor();
      const ajeno = await entorno.sembrador.reporte(await entorno.sembrador.usuario(), await entorno.sembrador.lugar());
      await denunciar(a, MotivoDenuncia.SPAM);
      await denunciar(b, MotivoDenuncia.SPAM);
      await denunciar(ajeno, MotivoDenuncia.SPAM);
      await entorno.dao.resolverPendientes(a, EstadoDenuncia.DESESTIMADA, 1, T0);
      expect(await entorno.dao.contarRecibidasPorAutor(autorId)).toBe(2);
    });
  });
}
