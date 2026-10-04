import type { RequestHandler } from 'express';
import { respuestaSinDatos } from '../dto/RespuestaDTO.js';
import type { RestablecerPasswordRequestDTO, SolicitarRecuperacionRequestDTO, ValidarTokenQueryDTO } from '../dto/request/recuperacion/RecuperacionRequestDTO.js';
import { TokenRecuperacionExpiradoException } from '../exception/recuperacion/TokenRecuperacionExpiradoException.js';
import { TokenRecuperacionInvalidoException } from '../exception/recuperacion/TokenRecuperacionInvalidoException.js';
import type { RecuperacionFacade } from '../facade/RecuperacionFacade.js';
import type { EstadoVista, VistaRestablecer } from '../view/VistaRestablecer.js';

/** Same text whether or not the email is registered (HU 2.1 c2). */
export const MENSAJE_RECUPERACION_NEUTRO = 'Si el correo está registrado, te enviamos instrucciones para restablecer tu contraseña.';

/** HTTP adapter of RecuperacionFacade. Input is already validated by the route's `validar`; errors propagate (Express 5). */
export class RecuperacionController {
  constructor(
    private readonly facade: RecuperacionFacade,
    private readonly vista: VistaRestablecer,
  ) {}

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

  /**
   * HTML page of the emailed link (ADR 14). The token decides what is served: a live one gets the form, an unknown,
   * used or expired one gets the "enlace caducado" page with the API's status (400 / 410) and no form at all. This is
   * the one handler that catches: a browser needs a page, not the JSON envelope. Anything else still propagates.
   */
  mostrarPagina: RequestHandler = async (req, res) => {
    const token = typeof req.query.token === 'string' ? req.query.token : '';
    let estado: EstadoVista = 'formulario';
    let status = 200;
    try {
      await this.facade.validarToken(token);
    } catch (error) {
      if (!(error instanceof TokenRecuperacionInvalidoException || error instanceof TokenRecuperacionExpiradoException)) throw error;
      estado = 'enlace-invalido';
      status = error.status;
    }
    const { html, csp } = this.vista.renderizar(estado);
    res
      .status(status)
      .set({ 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'Content-Security-Policy': csp })
      .type('html')
      .send(html);
  };
}
