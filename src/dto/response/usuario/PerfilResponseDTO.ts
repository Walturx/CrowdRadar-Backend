import type { UsuarioResponseDTO } from './UsuarioResponseDTO.js';

/** `data` of GET/PUT /api/users/profile. */
export interface PerfilResponseDTO {
  user: UsuarioResponseDTO;
}
