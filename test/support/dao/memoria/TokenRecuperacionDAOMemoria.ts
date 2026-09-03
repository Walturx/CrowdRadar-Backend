import type { NuevoTokenRecuperacion, TokenRecuperacionDAO } from '../../../../src/dao/TokenRecuperacionDAO.js';
import type { TokenRecuperacion } from '../../../../src/entity/TokenRecuperacion.js';
import { ConflictoException } from '../../../../src/exception/http/ConflictoException.js';
import { relojSistema, type Reloj } from '../../../../src/util/Reloj.js';
import { copia, exigirReferencia, sellosNuevos, type OpcionesMemoria } from './comun.js';
import type { SembradorMemoria } from './SembradorMemoria.js';

/** In-memory TokenRecuperacionDAO for tests; behaves like the Sequelize one (shared contract test). */
export class TokenRecuperacionDAOMemoria implements TokenRecuperacionDAO {
  private readonly filas: TokenRecuperacion[] = [];
  private siguienteId = 1;
  private readonly reloj: Reloj;
  private readonly sembrador?: SembradorMemoria;

  constructor(opciones: OpcionesMemoria = {}) {
    this.reloj = opciones.reloj ?? relojSistema;
    this.sembrador = opciones.sembrador;
  }

  async crear(datos: NuevoTokenRecuperacion): Promise<TokenRecuperacion> {
    exigirReferencia(this.sembrador, 'usuario', 'usuario_id', datos.usuarioId, 'token_recuperacion');
    if (this.filas.some((t) => t.tokenHash === datos.tokenHash)) throw new ConflictoException();
    const token: TokenRecuperacion = copia({
      ...datos,
      id: this.siguienteId++,
      usadoEn: null,
      ...sellosNuevos(this.reloj),
    });
    this.filas.push(token);
    return copia(token);
  }

  async buscarPorHash(tokenHash: string): Promise<TokenRecuperacion | null> {
    const token = this.filas.find((t) => t.tokenHash === tokenHash);
    return token ? copia(token) : null;
  }

  async marcarUsado(id: number, usadoEn: Date): Promise<boolean> {
    const token = this.filas.find((t) => t.id === id);
    if (!token) return false;
    Object.assign(token, { usadoEn: new Date(usadoEn), updatedAt: this.reloj.ahora() });
    return true;
  }

  async invalidarVigentesDeUsuario(usuarioId: number, ahora: Date): Promise<number> {
    const vigentes = this.filas.filter((t) => t.usuarioId === usuarioId && t.usadoEn === null);
    for (const t of vigentes) Object.assign(t, { usadoEn: new Date(ahora), updatedAt: this.reloj.ahora() });
    return vigentes.length;
  }
}
