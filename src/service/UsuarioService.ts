import type { ActualizarPerfilRequestDTO } from '../dto/request/usuario/ActualizarPerfilRequestDTO.js';
import type { CambiarPasswordRequestDTO } from '../dto/request/usuario/CambiarPasswordRequestDTO.js';
import type { PerfilResponseDTO } from '../dto/response/usuario/PerfilResponseDTO.js';

/** Own-account use cases (HU 1.3-1.4). */
export interface UsuarioService {
  obtenerPerfil(usuarioId: number): Promise<PerfilResponseDTO>;
  actualizarPerfil(usuarioId: number, dto: ActualizarPerfilRequestDTO): Promise<PerfilResponseDTO>;
  cambiarPassword(usuarioId: number, dto: CambiarPasswordRequestDTO): Promise<void>;
}
