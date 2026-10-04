import type { RequestHandler } from 'express';
import type { IniciarSesionRequestDTO } from '../dto/request/auth/IniciarSesionRequestDTO.js';
import type { RegistrarUsuarioRequestDTO } from '../dto/request/auth/RegistrarUsuarioRequestDTO.js';
import { respuesta } from '../dto/RespuestaDTO.js';
import type { AuthService } from '../service/AuthService.js';

/** HTTP adapter of AuthService. Input is already validated by the route's `validar`; errors propagate (Express 5). */
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  registrar: RequestHandler = async (req, res) => {
    const sesion = await this.authService.registrar(req.body as RegistrarUsuarioRequestDTO);
    res.status(201).json(respuesta('Usuario registrado correctamente.', sesion));
  };

  iniciarSesion: RequestHandler = async (req, res) => {
    const sesion = await this.authService.iniciarSesion(req.body as IniciarSesionRequestDTO);
    res.status(200).json(respuesta('Inicio de sesión exitoso.', sesion));
  };
}
