import type { RequestHandler } from 'express';
import type { ActualizarPerfilRequestDTO } from '../dto/request/usuario/ActualizarPerfilRequestDTO.js';
import type { CambiarPasswordRequestDTO } from '../dto/request/usuario/CambiarPasswordRequestDTO.js';
import { respuesta, respuestaSinDatos } from '../dto/RespuestaDTO.js';
import type { UsuarioService } from '../service/UsuarioService.js';

/** HTTP adapter of UsuarioService; `req.usuario` is set by `autenticar` on every route using it. */
export class UsuarioController {
  constructor(private readonly usuarioService: UsuarioService) {}

  obtenerPerfil: RequestHandler = async (req, res) => {
    const perfil = await this.usuarioService.obtenerPerfil(req.usuario!.id);
    res.status(200).json(respuesta('Perfil obtenido correctamente.', perfil));
  };

  actualizarPerfil: RequestHandler = async (req, res) => {
    const perfil = await this.usuarioService.actualizarPerfil(req.usuario!.id, req.body as ActualizarPerfilRequestDTO);
    res.status(200).json(respuesta('Perfil actualizado correctamente.', perfil));
  };

  cambiarPassword: RequestHandler = async (req, res) => {
    await this.usuarioService.cambiarPassword(req.usuario!.id, req.body as CambiarPasswordRequestDTO);
    res.status(200).json(respuestaSinDatos('Contraseña actualizada correctamente.'));
  };
}
