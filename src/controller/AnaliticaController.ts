import type { RequestHandler } from 'express';
import type {
  CompararQueryDTO,
  HistorialQueryDTO,
  MejorHorarioQueryDTO,
} from '../dto/request/analitica/AnaliticaRequestDTO.js';
import { respuesta } from '../dto/RespuestaDTO.js';
import { AnaliticaMapper } from '../mapper/AnaliticaMapper.js';
import type { AnaliticaService } from '../service/AnaliticaService.js';

const idDelLugar = (locals: Record<string, unknown>) => (locals.params as { id: number }).id;

/** HTTP adapter of AnaliticaService: validated query in `res.locals.query`, place id in `res.locals.params`. */
export class AnaliticaController {
  constructor(private readonly analiticaService: AnaliticaService) {}

  obtenerHistorial: RequestHandler = async (_req, res) => {
    const { desde, hasta, agrupacion } = res.locals.query as HistorialQueryDTO;
    const resultado = await this.analiticaService.obtenerHistorial(idDelLugar(res.locals), { desde, hasta, agrupacion });
    res.status(200).json(respuesta('Historial obtenido correctamente.', AnaliticaMapper.aHistorial(resultado)));
  };

  compararPeriodos: RequestHandler = async (_req, res) => {
    const { desdeA, hastaA, diasA, desdeB, hastaB, diasB } = res.locals.query as CompararQueryDTO;
    const resultado = await this.analiticaService.compararPeriodos(
      idDelLugar(res.locals),
      { desde: desdeA, hasta: hastaA, dias: diasA },
      { desde: desdeB, hasta: hastaB, dias: diasB },
    );
    res.status(200).json(respuesta('Comparación obtenida correctamente.', AnaliticaMapper.aComparacion(resultado)));
  };

  obtenerMejorHorario: RequestHandler = async (_req, res) => {
    const { dias, semanas } = res.locals.query as MejorHorarioQueryDTO;
    const resultado = await this.analiticaService.obtenerMejorHorario(idDelLugar(res.locals), dias, semanas);
    res.status(200).json(respuesta('Mejor horario obtenido correctamente.', AnaliticaMapper.aMejorHorario(resultado)));
  };
}
