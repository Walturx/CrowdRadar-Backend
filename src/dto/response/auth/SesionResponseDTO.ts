import type { UsuarioResponseDTO } from '../usuario/UsuarioResponseDTO.js';

/** `data` of register and login: the session token (ISO expiry) and the account. */
export interface SesionResponseDTO {
  token: string;
  expiraEn: string;
  user: UsuarioResponseDTO;
}
