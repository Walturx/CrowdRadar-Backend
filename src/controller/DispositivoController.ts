import type { RequestHandler } from 'express';
import type {
  DispositivoTokenParamsDTO,
  RegistrarDispositivoRequestDTO,
} from '../dto/request/alerta/DispositivoRequestDTO.js';
import { respuestaSinDatos } from '../dto/RespuestaDTO.js';
import type { DispositivoService } from '../service/DispositivoService.js';

/** HTTP adapter of DispositivoService; `req.usuario` is set by `autenticar`, body and params by `validar`. */
export class DispositivoController {
  constructor(private readonly dispositivoService: DispositivoService) {}

  registrar: RequestHandler = async (req, res) => {
    const { token, plataforma } = req.body as RegistrarDispositivoRequestDTO;
    const { creado } = await this.dispositivoService.registrar(req.usuario!.id, token, plataforma);
    res.status(creado ? 201 : 200).json(respuestaSinDatos('Dispositivo registrado correctamente.'));
  };

  eliminar: RequestHandler = async (req, res) => {
    const { token } = res.locals.params as DispositivoTokenParamsDTO;
    await this.dispositivoService.eliminar(req.usuario!.id, token);
    res.status(204).end();
  };
}
