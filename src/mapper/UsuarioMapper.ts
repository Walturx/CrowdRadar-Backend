import type { TokenEmitido } from '../adapter/seguridad/EmisorToken.js';
import type { SesionResponseDTO } from '../dto/response/auth/SesionResponseDTO.js';
import type { PerfilResponseDTO } from '../dto/response/usuario/PerfilResponseDTO.js';
import type { UsuarioResponseDTO } from '../dto/response/usuario/UsuarioResponseDTO.js';
import type { Puntaje } from '../entity/puntaje.js';
import type { Usuario } from '../entity/Usuario.js';

/**
 * Pattern: Mapper. The only place that turns a Usuario entity into what leaves over HTTP;
 * fields are listed explicitly so a new column (or the password hash) is never exposed by accident.
 * The points and tier are not columns: the caller hands in the user's Puntaje (PuntajeService).
 */
export const UsuarioMapper = {
  aResponse(usuario: Usuario, { puntos, tier }: Puntaje): UsuarioResponseDTO {
    return {
      id: usuario.id,
      nombre: usuario.nombre,
      apellido: usuario.apellido,
      email: usuario.email,
      telefono: usuario.telefono,
      distrito: usuario.distrito,
      rol: usuario.rol,
      status: usuario.status,
      puntos,
      tier,
    };
  },

  aPerfil(usuario: Usuario, puntaje: Puntaje): PerfilResponseDTO {
    return { user: UsuarioMapper.aResponse(usuario, puntaje) };
  },

  aSesion(usuario: Usuario, { token, expiraEn }: TokenEmitido, puntaje: Puntaje): SesionResponseDTO {
    return { token, expiraEn: expiraEn.toISOString(), user: UsuarioMapper.aResponse(usuario, puntaje) };
  },
};
