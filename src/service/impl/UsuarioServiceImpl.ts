import type { Hasher } from '../../adapter/seguridad/Hasher.js';
import type { DispositivoDAO } from '../../dao/DispositivoDAO.js';
import type { UsuarioDAO } from '../../dao/UsuarioDAO.js';
import type { ActualizarPerfilRequestDTO } from '../../dto/request/usuario/ActualizarPerfilRequestDTO.js';
import type { CambiarPasswordRequestDTO } from '../../dto/request/usuario/CambiarPasswordRequestDTO.js';
import type { PerfilResponseDTO } from '../../dto/response/usuario/PerfilResponseDTO.js';
import { PasswordActualIncorrectaException } from '../../exception/usuario/PasswordActualIncorrectaException.js';
import { PasswordRepetidaException } from '../../exception/usuario/PasswordRepetidaException.js';
import { UsuarioNoEncontradoException } from '../../exception/usuario/UsuarioNoEncontradoException.js';
import { UsuarioMapper } from '../../mapper/UsuarioMapper.js';
import type { UsuarioService } from '../UsuarioService.js';

export interface DependenciasUsuarioService {
  usuarioDAO: UsuarioDAO;
  hasher: Hasher;
  /** A password change ends the push sessions: the user's devices are deleted. */
  dispositivoDAO: DispositivoDAO;
}

export class UsuarioServiceImpl implements UsuarioService {
  constructor(private readonly deps: DependenciasUsuarioService) {}

  async obtenerPerfil(usuarioId: number): Promise<PerfilResponseDTO> {
    const usuario = await this.deps.usuarioDAO.buscarPorId(usuarioId);
    if (!usuario) throw new UsuarioNoEncontradoException();
    return UsuarioMapper.aPerfil(usuario);
  }

  async actualizarPerfil(usuarioId: number, dto: ActualizarPerfilRequestDTO): Promise<PerfilResponseDTO> {
    const usuario = await this.deps.usuarioDAO.actualizarPerfil(usuarioId, dto);
    if (!usuario) throw new UsuarioNoEncontradoException();
    return UsuarioMapper.aPerfil(usuario);
  }

  async cambiarPassword(usuarioId: number, dto: CambiarPasswordRequestDTO): Promise<void> {
    const { usuarioDAO, hasher, dispositivoDAO } = this.deps;
    const usuario = await usuarioDAO.buscarPorId(usuarioId);
    if (!usuario) throw new UsuarioNoEncontradoException();

    if (!(await hasher.comparar(dto.passwordActual, usuario.passwordHash ?? ''))) {
      throw new PasswordActualIncorrectaException();
    }
    if (dto.nuevaPassword === dto.passwordActual) throw new PasswordRepetidaException();

    await usuarioDAO.actualizarPasswordHash(usuarioId, await hasher.generar(dto.nuevaPassword));
    await dispositivoDAO.eliminarDeUsuario(usuarioId);
  }
}
