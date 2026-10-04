import type { ContextoTx } from '../../../../src/datasource/ConexionBD.js';
import type { ConteoCategoria, FiltroExploracion, FiltroLugares, LugarDAO } from '../../../../src/dao/LugarDAO.js';
import type { Bbox } from '../../../../src/entity/Bbox.js';
import type { Lugar } from '../../../../src/entity/Lugar.js';
import { CategoriaLugar } from '../../../../src/enum/CategoriaLugar.js';
import { nivelEfectivo } from '../../../../src/entity/nivelEfectivo.js';
import { NivelEfectivo, type NivelSaturacion } from '../../../../src/enum/NivelSaturacion.js';
import { compararNombres, normalizarNombre } from '../../../../src/util/nombreLugar.js';
import { relojSistema, type Reloj } from '../../../../src/util/Reloj.js';
import { aLugar } from '../../fabrica/datos.js';
import { CerrojosMemoria } from './cerrojosMemoria.js';
import { copia, type OpcionesMemoria } from './comun.js';

/** Same order as the Sequelize DAO: normalised name, exact name (both by code point), then id. */
const porNombre = (a: Lugar, b: Lugar) =>
  compararNombres(normalizarNombre(a.nombre), normalizarNombre(b.nombre)) || compararNombres(a.nombre, b.nombre) || a.id - b.id;
const dentro = (l: Lugar, b: Bbox) =>
  l.latitud >= b.minLat && l.latitud <= b.maxLat && l.longitud >= b.minLng && l.longitud <= b.maxLng;
/** Criteria `buscar` and `explorar` share: bbox and category. */
const coincide = (l: Lugar, filtro: Pick<FiltroExploracion, 'bbox' | 'categoria'>) =>
  (!filtro.bbox || dentro(l, filtro.bbox)) && (!filtro.categoria || l.categoria === filtro.categoria);

/** In-memory LugarDAO for tests; behaves like the Sequelize one (shared contract test). */
export class LugarDAOMemoria implements LugarDAO {
  private readonly filas = new Map<number, Lugar>();
  private readonly cerrojos = new CerrojosMemoria();
  private readonly reloj: Reloj;
  private readonly limiteMax: number;

  /** `limiteMax` is the cap of every list read (LUGARES_LIMITE_MAX in production); unlimited by default. */
  constructor(opciones: OpcionesMemoria & { limiteMax?: number } = {}) {
    this.reloj = opciones.reloj ?? relojSistema;
    this.limiteMax = opciones.limiteMax ?? Number.MAX_SAFE_INTEGER;
  }

  /** Seeds a place; unspecified fields take the test-data defaults. */
  agregar(datos: Partial<Lugar> = {}): Lugar {
    const lugar = aLugar(datos);
    this.filas.set(lugar.id, copia(lugar));
    return copia(lugar);
  }

  async buscarPorId(id: number): Promise<Lugar | null> {
    const lugar = this.filas.get(id);
    return lugar ? copia(lugar) : null;
  }

  /** Like `SELECT ... FOR UPDATE`: the row lock is held until the in-memory transaction ends. */
  async buscarPorIdParaActualizar(id: number, tx: ContextoTx): Promise<Lugar | null> {
    await this.cerrojos.adquirir(`lugar:${id}`, tx);
    return this.buscarPorId(id);
  }

  async buscarPorIds(ids: readonly number[]): Promise<Lugar[]> {
    return copia([...new Set(ids)].flatMap((id) => this.filas.get(id) ?? []));
  }

  async buscar(filtro: FiltroLugares): Promise<Lugar[]> {
    const q = filtro.q === undefined ? undefined : normalizarNombre(filtro.q);
    return copia([...this.filas.values()]
      .filter((l) => q === undefined || normalizarNombre(l.nombre).includes(q))
      .filter((l) => !filtro.nivel || this.nivelEfectivo(l, filtro.vigenteDesde) === filtro.nivel)
      .filter((l) => coincide(l, filtro))
      .sort(porNombre)
      .slice(0, this.limiteEfectivo(filtro.limite)));
  }

  async explorar(filtro: FiltroExploracion): Promise<Lugar[]> {
    return copia(
      [...this.filas.values()]
        .filter((l) => coincide(l, filtro))
        .sort(porNombre)
        .slice(0, this.limiteEfectivo(filtro.limite)),
    );
  }

  async contarPorCategoria(): Promise<ConteoCategoria[]> {
    return Object.values(CategoriaLugar).map((categoria) => ({
      categoria,
      total: [...this.filas.values()].filter((l) => l.categoria === categoria).length,
    }));
  }

  async actualizarSaturacion(id: number, nivel: NivelSaturacion | null, actualizadaEn: Date): Promise<Lugar | null> {
    const actual = this.filas.get(id);
    if (!actual) return null;
    const nuevo = { ...actual, saturacionActual: nivel, saturacionActualizadaEn: new Date(actualizadaEn), updatedAt: this.reloj.ahora() };
    this.filas.set(id, nuevo);
    return copia(nuevo);
  }

  private limiteEfectivo(limite: number): number {
    return Math.min(limite, this.limiteMax);
  }

  /** Without `vigenteDesde` the stored level is taken as is (the same as the SQL filter); otherwise the shared rule. */
  private nivelEfectivo(lugar: Lugar, vigenteDesde?: Date): NivelEfectivo {
    if (vigenteDesde) return nivelEfectivo(lugar, vigenteDesde);
    return lugar.saturacionActual ?? NivelEfectivo.SIN_INFORMACION;
  }
}
