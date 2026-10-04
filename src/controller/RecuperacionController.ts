import type { RequestHandler } from 'express';
import { respuestaSinDatos } from '../dto/RespuestaDTO.js';
import type { RestablecerPasswordRequestDTO, SolicitarRecuperacionRequestDTO, ValidarTokenQueryDTO } from '../dto/request/recuperacion/RecuperacionRequestDTO.js';
import type { RecuperacionFacade } from '../facade/RecuperacionFacade.js';

/** Same text whether or not the email is registered (HU 2.1 c2). */
export const MENSAJE_RECUPERACION_NEUTRO = 'Si el correo está registrado, te enviamos instrucciones para restablecer tu contraseña.';

/** HTTP adapter of RecuperacionFacade. Input is already validated by the route's `validar`; errors propagate (Express 5). */
export class RecuperacionController {
  constructor(private readonly facade: RecuperacionFacade) {}

  solicitar: RequestHandler = async (req, res) => {
    await this.facade.solicitar((req.body as SolicitarRecuperacionRequestDTO).email);
    res.status(200).json(respuestaSinDatos(MENSAJE_RECUPERACION_NEUTRO));
  };

  validarToken: RequestHandler = async (_req, res) => {
    await this.facade.validarToken((res.locals.query as ValidarTokenQueryDTO).token);
    res.status(200).json(respuestaSinDatos('El enlace es válido.'));
  };

  restablecer: RequestHandler = async (req, res) => {
    const { token, nuevaPassword } = req.body as RestablecerPasswordRequestDTO;
    await this.facade.restablecer(token, nuevaPassword);
    res.status(200).json(respuestaSinDatos('Contraseña restablecida. Ya puedes iniciar sesión.'));
  };
}
