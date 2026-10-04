/**
 * Pattern: Facade. Hides six collaborators (UsuarioDAO, TokenRecuperacionDAO, Hasher, GeneradorToken,
 * EnviadorCorreo, ConexionBD) behind the three recovery steps. Owner: M1.
 * Throws TokenRecuperacionInvalidoException (400), TokenRecuperacionExpiradoException (410), PasswordRepetidaException (422).
 */
export interface RecuperacionFacade {
  /**
   * Same outcome whether or not the email exists (anti-enumeration). Invalidates earlier tokens, stores only the
   * SHA-256 of a new 32-byte token valid RECUPERACION_EXPIRA_MIN minutes and sends the link without blocking the answer.
   */
  solicitar(email: string): Promise<void>;
  /** Resolves when the token exists, is unused and is not expired. */
  validarToken(token: string): Promise<void>;
  /** One transaction: new password hash, token marked used, other tokens of the user invalidated. */
  restablecer(token: string, nuevaPassword: string): Promise<void>;
}
