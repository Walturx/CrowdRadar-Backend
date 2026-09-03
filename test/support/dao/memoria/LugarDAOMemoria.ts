import type { Bbox, ConteoCategoria, FiltroExploracion, FiltroLugares, LugarDAO } from '../../../../src/dao/LugarDAO.js';
import type { Lugar } from '../../../../src/entity/Lugar.js';
import { CategoriaLugar } from '../../../../src/enum/CategoriaLugar.js';
import { NivelEfectivo, type NivelSaturacion } from '../../../../src/enum/NivelSaturacion.js';
import { relojSistema, type Reloj } from '../../../../src/util/Reloj.js';
import { aLugar } from '../../fabrica/datos.js';
import { copia, type OpcionesMemoria } from './comun.js';

const sinAcentos = (texto: string) => texto.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
const porNombre = (a: Lugar, b: Lugar) => a.nombre.localeCompare(b.nombre) || a.id - b.id;
const dentro = (l: Lugar, b: Bbox) =>
  l.latitud >= b.minLat && l.latitud <= b.maxLat && l.longitud >= b.minLng && l.longitud <= b.maxLng;

/** In-memory LugarDAO for tests; behaves like the Sequelize one (shared contract test). */
export class LugarDAOMemoria implements LugarDAO {
  private readonly filas = new Map<number, Lugar>();
  private readonly reloj: Reloj;

  constructor(opciones: OpcionesMemoria = {}) {
    this.reloj = opciones.reloj ?? relojSistema;
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

  async buscarPorIds(ids: readonly number[]): Promise<Lugar[]> {
    return copia([...new Set(ids)].flatMap((id) => this.filas.get(id) ?? []));
  }

  async buscar(filtro: FiltroLugares): Promise<Lugar[]> {
    const q = filtro.q === undefined ? undefined : sinAcentos(filtro.q);
    return copia([...this.filas.values()]
      .filter((l) => q === undefined || sinAcentos(l.nombre).includes(q))
      .filter((l) => !filtro.bbox || dentro(l, filtro.bbox))
      .filter((l) => !filtro.categoria || l.categoria === filtro.categoria)
      .filter((l) => !filtro.nivel || this.nivelEfectivo(l, filtro.vigenteDesde) === filtro.nivel)
      .sort(porNombre)
      .slice(0, filtro.limite));
  }

  async explorar(filtro: FiltroExploracion): Promise<Lugar[]> {
    return copia(
      [...this.filas.values()]
        .filter((l) => !filtro.categoria || l.categoria === filtro.categoria)
        .filter((l) => !filtro.bbox || dentro(l, filtro.bbox))
        .sort(porNombre),
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

  private nivelEfectivo(lugar: Lugar, vigenteDesde?: Date): NivelEfectivo {
    const { saturacionActual, saturacionActualizadaEn } = lugar;
    if (!saturacionActual) return NivelEfectivo.SIN_INFORMACION;
    if (vigenteDesde && (!saturacionActualizadaEn || saturacionActualizadaEn < vigenteDesde)) {
      return NivelEfectivo.SIN_INFORMACION;
    }
    return saturacionActual;
  }
}
