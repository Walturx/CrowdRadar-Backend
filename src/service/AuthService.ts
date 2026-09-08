import type { IniciarSesionRequestDTO } from '../dto/request/auth/IniciarSesionRequestDTO.js';
import type { RegistrarUsuarioRequestDTO } from '../dto/request/auth/RegistrarUsuarioRequestDTO.js';
import type { SesionResponseDTO } from '../dto/response/auth/SesionResponseDTO.js';

/** Account access use cases (HU 1.1-1.2). Both answer with a started session. */
export interface AuthService {
  /** Creates the account and signs the user in. Throws EmailYaRegistradoException on a duplicate email. */
  registrar(dto: RegistrarUsuarioRequestDTO): Promise<SesionResponseDTO>;
  iniciarSesion(dto: IniciarSesionRequestDTO): Promise<SesionResponseDTO>;
}
