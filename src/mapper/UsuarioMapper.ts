import type { TokenEmitido } from '../adapter/seguridad/EmisorToken.js';
import type { SesionResponseDTO } from '../dto/response/auth/SesionResponseDTO.js';
import type { PerfilResponseDTO } from '../dto/response/usuario/PerfilResponseDTO.js';
import type { UsuarioResponseDTO } from '../dto/response/usuario/UsuarioResponseDTO.js';
import type { Usuario } from '../entity/Usuario.js';

/**
 * Pattern: Mapper. The only place that turns a Usuario entity into what leaves over HTTP;
 * fields are listed explicitly so a new column (or the password hash) is never exposed by accident.
 */
export const UsuarioMapper = {
  aResponse(usuario: Usuario): UsuarioResponseDTO {
    return {
      id: usuario.id,
      nombre: usuario.nombre,
      apellido: usuario.apellido,
      email: usuario.email,
      telefono: usuario.telefono,
      distrito: usuario.distrito,
      rol: usuario.rol,
      status: usuario.status,
      puntosKarma: usuario.puntosKarma,
    };
  },

  aPerfil(usuario: Usuario): PerfilResponseDTO {
    return { user: UsuarioMapper.aResponse(usuario) };
  },

  aSesion(usuario: Usuario, { token, expiraEn }: TokenEmitido): SesionResponseDTO {
    return { token, expiraEn: expiraEn.toISOString(), user: UsuarioMapper.aResponse(usuario) };
  },
};
