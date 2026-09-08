import { randomUUID } from 'node:crypto';
import type { EmisorToken } from '../../adapter/seguridad/EmisorToken.js';
import type { Hasher } from '../../adapter/seguridad/Hasher.js';
import type { UsuarioDAO } from '../../dao/UsuarioDAO.js';
import type { IniciarSesionRequestDTO } from '../../dto/request/auth/IniciarSesionRequestDTO.js';
import type { RegistrarUsuarioRequestDTO } from '../../dto/request/auth/RegistrarUsuarioRequestDTO.js';
import type { SesionResponseDTO } from '../../dto/response/auth/SesionResponseDTO.js';
import { CredencialesInvalidasException } from '../../exception/usuario/CredencialesInvalidasException.js';
import { CuentaNoExisteException } from '../../exception/usuario/CuentaNoExisteException.js';
import { UsuarioMapper } from '../../mapper/UsuarioMapper.js';
import type { AuthService } from '../AuthService.js';
import type { VerificadorEstadoCuenta } from '../VerificadorEstadoCuenta.js';

export interface DependenciasAuthService {
  usuarioDAO: UsuarioDAO;
  hasher: Hasher;
  emisorToken: EmisorToken;
  verificador: VerificadorEstadoCuenta;
  /** GENERICA: unknown email and wrong password look identical; DETALLADA tells them apart (404). */
  politicaMensajes: 'GENERICA' | 'DETALLADA';
}

export class AuthServiceImpl implements AuthService {
  /** Valid bcrypt hash (same cost as real ones) compared against when the email is unknown. */
  private readonly hashSenuelo: Promise<string>;

  constructor(private readonly deps: DependenciasAuthService) {
    this.hashSenuelo = deps.hasher.generar(randomUUID());
    this.hashSenuelo.catch(() => undefined); // surfaced when awaited at login
  }

  async registrar(dto: RegistrarUsuarioRequestDTO): Promise<SesionResponseDTO> {
    const { usuarioDAO, hasher, emisorToken } = this.deps;
    const { password, ...perfil } = dto;
    const usuario = await usuarioDAO.crear({ ...perfil, passwordHash: await hasher.generar(password) });
    return UsuarioMapper.aSesion(usuario, emisorToken.emitir(usuario));
  }

  async iniciarSesion({ email, password }: IniciarSesionRequestDTO): Promise<SesionResponseDTO> {
    const { usuarioDAO, hasher, emisorToken, verificador, politicaMensajes } = this.deps;
    const usuario = await usuarioDAO.buscarPorEmail(email);

    // Always compare, against a decoy hash when there is nothing to compare with, so the
    // response time does not reveal whether the email exists.
    const coincide = await hasher.comparar(password, usuario?.passwordHash ?? (await this.hashSenuelo));

    if (!usuario) {
      throw politicaMensajes === 'DETALLADA' ? new CuentaNoExisteException() : new CredencialesInvalidasException();
    }
    if (!coincide || !usuario.passwordHash) throw new CredencialesInvalidasException();

    await verificador.verificar(usuario);
    return UsuarioMapper.aSesion(usuario, emisorToken.emitir(usuario));
  }
}
