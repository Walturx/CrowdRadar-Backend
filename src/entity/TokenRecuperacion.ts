/** Domain entity for `token_recuperacion`: only the SHA-256 hash of the emailed token is stored (M1). */
export interface TokenRecuperacion {
  id: number;
  usuarioId: number;
  tokenHash: string;
  expiraEn: Date;
  usadoEn: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
