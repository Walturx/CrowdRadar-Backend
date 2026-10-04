/**
 * Exception hierarchy and the frozen error codes (design section 5, spec R-A6.1).
 */
import { describe, expect, it } from 'vitest';
import { AppException } from '../../src/exception/AppException.js';
import { CodigoError } from '../../src/exception/CodigoError.js';
import { AccesoDenegadoException } from '../../src/exception/http/AccesoDenegadoException.js';
import { ConflictoException } from '../../src/exception/http/ConflictoException.js';
import { DemasiadasSolicitudesException } from '../../src/exception/http/DemasiadasSolicitudesException.js';
import { NoAutenticadoException } from '../../src/exception/http/NoAutenticadoException.js';
import { NoImplementadoException } from '../../src/exception/http/NoImplementadoException.js';
import { RecursoNoEncontradoException } from '../../src/exception/http/RecursoNoEncontradoException.js';
import { ReglaNegocioException } from '../../src/exception/http/ReglaNegocioException.js';
import { ServicioNoDisponibleException } from '../../src/exception/http/ServicioNoDisponibleException.js';
import { ValidacionException } from '../../src/exception/http/ValidacionException.js';

const CODIGOS_CONGELADOS = [
  // 400
  'VALIDACION_FALLIDA',
  'JSON_INVALIDO',
  'TOKEN_RECUPERACION_INVALIDO',
  'RANGO_FECHAS_INVALIDO',
  // 401
  'NO_AUTENTICADO',
  'TOKEN_INVALIDO',
  'CREDENCIALES_INVALIDAS',
  // 403
  'CUENTA_SUSPENDIDA',
  'ACCESO_DENEGADO',
  // 404
  'RUTA_NO_ENCONTRADA',
  'CUENTA_NO_EXISTE',
  'USUARIO_NO_ENCONTRADO',
  'LUGAR_NO_ENCONTRADO',
  'REPORTE_NO_ENCONTRADO',
  'FAVORITO_NO_ENCONTRADO',
  'ALERTA_NO_ENCONTRADA',
  // 409
  'EMAIL_DUPLICADO',
  'FAVORITO_DUPLICADO',
  'VALIDACION_DUPLICADA',
  'DENUNCIA_DUPLICADA',
  'USUARIO_YA_SUSPENDIDO',
  'USUARIO_NO_SUSPENDIDO',
  'SIN_DENUNCIAS_PENDIENTES',
  'CONFLICTO',
  // 410
  'TOKEN_RECUPERACION_EXPIRADO',
  // 422
  'REPORTE_EN_ESPERA',
  'AUTOVALIDACION_NO_PERMITIDA',
  'AUTODENUNCIA_NO_PERMITIDA',
  'PASSWORD_ACTUAL_INCORRECTA',
  'PASSWORD_REPETIDA',
  'OPERACION_NO_PERMITIDA',
  // 429, 5xx
  'DEMASIADAS_SOLICITUDES',
  'ERROR_INTERNO',
  'NO_IMPLEMENTADO',
  'SERVICIO_NO_DISPONIBLE',
];

describe('CodigoError', () => {
  it('contiene exactamente los codigos congelados del diseno', () => {
    expect(Object.values(CodigoError).sort()).toEqual([...CODIGOS_CONGELADOS].sort());
  });

  it('cada clave coincide con su valor (SCREAMING_SNAKE)', () => {
    const entradas = Object.entries(CodigoError);
    expect(entradas).toHaveLength(CODIGOS_CONGELADOS.length);
    for (const [clave, valor] of entradas) expect(valor).toBe(clave);
  });
});

describe('excepciones base', () => {
  it.each([
    ['ValidacionException', new ValidacionException(), 400, 'VALIDACION_FALLIDA', 'Datos inválidos.'],
    [
      'NoAutenticadoException',
      new NoAutenticadoException(CodigoError.TOKEN_INVALIDO, 'Token inválido.'),
      401,
      'TOKEN_INVALIDO',
      'Token inválido.',
    ],
    ['AccesoDenegadoException', new AccesoDenegadoException(), 403, 'ACCESO_DENEGADO', 'No tienes permisos para realizar esta acción.'],
    [
      'RecursoNoEncontradoException',
      new RecursoNoEncontradoException(CodigoError.LUGAR_NO_ENCONTRADO, 'Lugar no encontrado.'),
      404,
      'LUGAR_NO_ENCONTRADO',
      'Lugar no encontrado.',
    ],
    ['ConflictoException', new ConflictoException(), 409, 'CONFLICTO', 'El recurso ya existe o está en conflicto.'],
    [
      'ReglaNegocioException',
      new ReglaNegocioException(CodigoError.REPORTE_EN_ESPERA, 'Espera antes de reportar de nuevo.'),
      422,
      'REPORTE_EN_ESPERA',
      'Espera antes de reportar de nuevo.',
    ],
    ['DemasiadasSolicitudesException', new DemasiadasSolicitudesException(), 429, 'DEMASIADAS_SOLICITUDES', 'Demasiadas solicitudes. Inténtalo más tarde.'],
    ['NoImplementadoException', new NoImplementadoException(), 501, 'NO_IMPLEMENTADO', 'Funcionalidad no implementada.'],
    [
      'ServicioNoDisponibleException',
      new ServicioNoDisponibleException(),
      503,
      'SERVICIO_NO_DISPONIBLE',
      'Servicio no disponible. Inténtalo de nuevo más tarde.',
    ],
  ])('%s expone status, code y message del contrato', (nombre, excepcion, status, code, message) => {
    expect(excepcion).toBeInstanceOf(AppException);
    expect(excepcion).toBeInstanceOf(Error);
    expect(excepcion.name).toBe(nombre);
    expect(excepcion.status).toBe(status);
    expect(excepcion.code).toBe(code);
    expect(excepcion.message).toBe(message);
    expect(excepcion.errors).toEqual([]);
  });

  it('ValidacionException transporta los errores por campo y permite otro codigo', () => {
    const excepcion = new ValidacionException(
      [
        { campo: 'email', mensaje: 'Correo inválido.' },
        { campo: 'password', mensaje: 'Demasiado corta.' },
      ],
      'Fechas inválidas.',
      CodigoError.RANGO_FECHAS_INVALIDO,
    );
    expect(excepcion.status).toBe(400);
    expect(excepcion.code).toBe('RANGO_FECHAS_INVALIDO');
    expect(excepcion.message).toBe('Fechas inválidas.');
    expect(excepcion.errors).toEqual([
      { campo: 'email', mensaje: 'Correo inválido.' },
      { campo: 'password', mensaje: 'Demasiado corta.' },
    ]);
  });

  it('las bases aceptan un codigo propio del modulo', () => {
    const excepcion = new ConflictoException(CodigoError.EMAIL_DUPLICADO, 'El correo ya está registrado.');
    expect(excepcion.status).toBe(409);
    expect(excepcion.code).toBe('EMAIL_DUPLICADO');
    expect(excepcion.message).toBe('El correo ya está registrado.');
  });
});
