import type { Lugar } from '../../../src/entity/Lugar.js';
import type { ReporteSaturacion } from '../../../src/entity/ReporteSaturacion.js';
import type { Usuario } from '../../../src/entity/Usuario.js';
import { CategoriaLugar } from '../../../src/enum/CategoriaLugar.js';
import { EstadoReporte } from '../../../src/enum/EstadoReporte.js';
import { NivelSaturacion } from '../../../src/enum/NivelSaturacion.js';
import { EstadoCuenta } from '../../../src/enum/EstadoCuenta.js';
import { Rol } from '../../../src/enum/Rol.js';

let secuencia = 0;

/** Test data builder: a valid, active Usuario; override only what the test cares about. */
export function aUsuario(sobrescritos: Partial<Usuario> = {}): Usuario {
  secuencia += 1;
  return {
    id: secuencia,
    nombre: 'Ana',
    apellido: 'Pérez',
    email: `usuario${secuencia}@crowdradar.pe`,
    passwordHash: null,
    telefono: null,
    distrito: null,
    rol: Rol.USUARIO,
    status: EstadoCuenta.ACTIVO,
    puntosKarma: 0,
    passwordCambiadaEn: null,
    createdAt: new Date('2026-10-05T10:00:00Z'),
    updatedAt: new Date('2026-10-05T10:00:00Z'),
    ...sobrescritos,
  };
}

const FECHA_BASE = new Date('2026-10-05T10:00:00Z');

/** Test data builder: a valid Lugar (Parque in Miraflores, no saturation reading). */
export function aLugar(sobrescritos: Partial<Lugar> = {}): Lugar {
  secuencia += 1;
  return {
    id: secuencia,
    osmId: null,
    nombre: `Lugar ${secuencia}`,
    direccion: null,
    latitud: -12.12,
    longitud: -77.03,
    categoria: CategoriaLugar.PARQUE,
    saturacionActual: null,
    saturacionActualizadaEn: null,
    horarioAtencion: null,
    horaApertura: null,
    horaCierre: null,
    urlFoto: null,
    createdAt: FECHA_BASE,
    updatedAt: FECHA_BASE,
    ...sobrescritos,
  };
}

/** Test data builder: a valid ACTIVO ReporteSaturacion that earned no points yet. */
export function aReporte(sobrescritos: Partial<ReporteSaturacion> = {}): ReporteSaturacion {
  secuencia += 1;
  return {
    id: secuencia,
    usuarioId: 1,
    lugarId: 1,
    nivelSaturacion: NivelSaturacion.MODERADO,
    fechaHora: FECHA_BASE,
    nivelConfiabilidad: null,
    estado: EstadoReporte.ACTIVO,
    puntosOtorgados: 0,
    motivoSinPuntos: null,
    createdAt: FECHA_BASE,
    updatedAt: FECHA_BASE,
    ...sobrescritos,
  };
}
