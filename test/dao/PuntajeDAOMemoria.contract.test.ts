import { EstadoReporte } from '../../src/enum/EstadoReporte.js';
import { NivelSaturacion } from '../../src/enum/NivelSaturacion.js';
import { PuntajeDAOMemoria } from '../support/dao/memoria/PuntajeDAOMemoria.js';
import { ReporteDAOMemoria } from '../support/dao/memoria/ReporteDAOMemoria.js';
import { ValidacionDAOMemoria } from '../support/dao/memoria/ValidacionDAOMemoria.js';
import { contratoPuntajeDAO } from './PuntajeDAO.contract.js';

contratoPuntajeDAO('memoria', async () => {
  const reportes = new ReporteDAOMemoria();
  const validaciones = new ValidacionDAOMemoria();
  let ultimoUsuario = 0;
  return {
    dao: new PuntajeDAOMemoria({ reportes, validaciones }),
    usuario: async () => ++ultimoUsuario,
    reporte: async (autorId) =>
      (await reportes.crear({ usuarioId: autorId, lugarId: 1, nivelSaturacion: NivelSaturacion.MODERADO, fechaHora: new Date() })).id,
    votar: async (usuarioId, reporteId, tipoAccion) => {
      await validaciones.crear({ reporteId, usuarioId, tipoAccion, fechaHora: new Date() });
    },
    eliminar: async (reporteId) => {
      await reportes.actualizarEstado(reporteId, EstadoReporte.ELIMINADO);
    },
    lecturas: () => 0,
    cerrar: () => undefined,
  };
});
