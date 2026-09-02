/** Domain entity for `lugar_favorito`: a user's saved place; `alertasActivadas` is the alert preference (M3). */
export interface LugarFavorito {
  id: number;
  usuarioId: number;
  lugarId: number;
  alertasActivadas: boolean;
  createdAt: Date;
  updatedAt: Date;
}
