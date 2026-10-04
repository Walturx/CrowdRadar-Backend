import type { DispositivoDAO, ResultadoRegistro } from '../../../../src/dao/DispositivoDAO.js';
import type { DispositivoPush } from '../../../../src/entity/DispositivoPush.js';
import type { PlataformaPush } from '../../../../src/enum/PlataformaPush.js';
import { relojSistema, type Reloj } from '../../../../src/util/Reloj.js';
import { copia, exigirReferencia, sellosNuevos, type OpcionesMemoria } from './comun.js';
import type { SembradorMemoria } from './SembradorMemoria.js';

/** In-memory DispositivoDAO for tests; behaves like the Sequelize one (shared contract test). */
export class DispositivoDAOMemoria implements DispositivoDAO {
  private filas: DispositivoPush[] = [];
  private siguienteId = 1;
  private readonly reloj: Reloj;
  private readonly sembrador?: SembradorMemoria;

  constructor(opciones: OpcionesMemoria = {}) {
    this.reloj = opciones.reloj ?? relojSistema;
    this.sembrador = opciones.sembrador;
  }

  async registrar(usuarioId: number, tokenFcm: string, plataforma: PlataformaPush): Promise<ResultadoRegistro> {
    exigirReferencia(this.sembrador, 'usuario', 'usuario_id', usuarioId, 'dispositivo_push');
    const existente = this.filas.find((d) => d.tokenFcm === tokenFcm);
    if (existente) {
      Object.assign(existente, { usuarioId, plataforma, updatedAt: this.reloj.ahora() });
      return { dispositivo: copia(existente), creado: false };
    }
    const dispositivo: DispositivoPush = {
      id: this.siguienteId++,
      usuarioId,
      tokenFcm,
      plataforma,
      ...sellosNuevos(this.reloj),
    };
    this.filas.push(dispositivo);
    return { dispositivo: copia(dispositivo), creado: true };
  }

  async listarTokensPorUsuario(usuarioId: number): Promise<string[]> {
    return this.filas.filter((d) => d.usuarioId === usuarioId).map((d) => d.tokenFcm);
  }

  async eliminarPorToken(usuarioId: number, tokenFcm: string): Promise<boolean> {
    return this.borrar((d) => d.usuarioId === usuarioId && d.tokenFcm === tokenFcm) > 0;
  }

  async eliminarTokens(tokens: readonly string[]): Promise<number> {
    const lista = new Set(tokens);
    return this.borrar((d) => lista.has(d.tokenFcm));
  }

  private borrar(coincide: (d: DispositivoPush) => boolean): number {
    const antes = this.filas.length;
    this.filas = this.filas.filter((d) => !coincide(d));
    return antes - this.filas.length;
  }
}
