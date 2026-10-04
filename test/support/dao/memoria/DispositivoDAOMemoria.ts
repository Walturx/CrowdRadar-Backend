import type { DispositivoDAO, ResultadoRegistro } from '../../../../src/dao/DispositivoDAO.js';
import type { DispositivoPush } from '../../../../src/entity/DispositivoPush.js';
import type { PlataformaPush } from '../../../../src/enum/PlataformaPush.js';

/** In-memory DispositivoDAO for tests; behaves like the Sequelize one (shared contract test). */
export class DispositivoDAOMemoria implements DispositivoDAO {
  private filas: DispositivoPush[] = [];
  private siguienteId = 1;

  async registrar(usuarioId: number, tokenFcm: string, plataforma: PlataformaPush): Promise<ResultadoRegistro> {
    const existente = this.filas.find((d) => d.tokenFcm === tokenFcm);
    if (existente) {
      Object.assign(existente, { usuarioId, plataforma, updatedAt: new Date() });
      return { dispositivo: existente, creado: false };
    }
    const ahora = new Date();
    const dispositivo: DispositivoPush = {
      id: this.siguienteId++,
      usuarioId,
      tokenFcm,
      plataforma,
      createdAt: ahora,
      updatedAt: ahora,
    };
    this.filas.push(dispositivo);
    return { dispositivo, creado: true };
  }

  async listarTokensPorUsuario(usuarioId: number): Promise<string[]> {
    return this.filas.filter((d) => d.usuarioId === usuarioId).map((d) => d.tokenFcm);
  }

  async eliminarPorToken(usuarioId: number, tokenFcm: string): Promise<boolean> {
    return (await this.borrar((d) => d.usuarioId === usuarioId && d.tokenFcm === tokenFcm)) > 0;
  }

  async eliminarTokens(tokens: readonly string[]): Promise<number> {
    const lista = new Set(tokens);
    return this.borrar((d) => lista.has(d.tokenFcm));
  }

  private async borrar(coincide: (d: DispositivoPush) => boolean): Promise<number> {
    const antes = this.filas.length;
    this.filas = this.filas.filter((d) => !coincide(d));
    return antes - this.filas.length;
  }
}
