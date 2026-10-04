/**
 * The frozen route table of the API contract (design section 5) as concrete requests.
 * `nombre` is the stub identifier echoed in the 501 message, so a test can tell WHICH
 * handler answered (e.g. /lugares/explorar must not be swallowed by /lugares/:id).
 */
export type Acceso = 'publica' | 'auth' | 'admin';
export type Metodo = 'get' | 'post' | 'put' | 'patch' | 'delete';

export interface FilaRuta {
  metodo: Metodo;
  ruta: string;
  acceso: Acceso;
  nombre: string;
  /** True once the owning stream replaced the 501 stub with a real handler (the route no longer answers 501). */
  entregada?: boolean;
}

const publica = (metodo: Metodo, ruta: string, nombre: string, entregada = false): FilaRuta => ({
  metodo,
  ruta,
  acceso: 'publica',
  nombre,
  ...(entregada ? { entregada } : {}),
});
const auth = (metodo: Metodo, ruta: string, nombre: string, entregada = false): FilaRuta => ({
  metodo,
  ruta,
  acceso: 'auth',
  nombre,
  ...(entregada ? { entregada } : {}),
});
const admin = (metodo: Metodo, ruta: string, nombre: string): FilaRuta => ({ metodo, ruta, acceso: 'admin', nombre });

export const TABLA_RUTAS: readonly FilaRuta[] = [
  // recuperacion (M1)
  publica('post', '/api/auth/recuperar', 'recuperacion.solicitar', true),
  publica('get', '/api/auth/restablecer/validar?token=abc', 'recuperacion.validarToken', true),
  publica('post', '/api/auth/restablecer', 'recuperacion.restablecer', true),
  publica('get', '/recuperar/restablecer', 'recuperacion.mostrarPagina', true),
  // lugar (M2) and exploracion (M3): explorar and categorias BEFORE /:id
  auth('get', '/api/lugares', 'lugar.buscar', true),
  auth('get', '/api/lugares/explorar', 'exploracion.explorar', true),
  auth('get', '/api/lugares/categorias', 'exploracion.listarCategorias', true),
  auth('get', '/api/lugares/12', 'lugar.obtenerDetalle', true),
  // analitica (M4)
  auth('get', '/api/lugares/12/historial', 'analitica.obtenerHistorial', true),
  auth('get', '/api/lugares/12/comparar', 'analitica.compararPeriodos', true),
  auth('get', '/api/lugares/12/mejor-horario', 'analitica.obtenerMejorHorario', true),
  // favoritos y alertas (M3)
  auth('get', '/api/favoritos', 'favorito.listar', true),
  auth('post', '/api/favoritos', 'favorito.agregar', true),
  auth('delete', '/api/favoritos/12', 'favorito.eliminar', true),
  auth('patch', '/api/favoritos/12/alertas', 'favorito.configurarAlertas', true),
  auth('get', '/api/alertas', 'alerta.listar', true),
  auth('patch', '/api/alertas/12/leida', 'alerta.marcarLeida', true),
  auth('post', '/api/dispositivos', 'alerta.registrarDispositivo', true),
  auth('delete', '/api/dispositivos/token-fcm', 'alerta.eliminarDispositivo', true),
  // reporte (M4): /reportes/mios BEFORE /reportes/:id (validacion router, M5)
  auth('post', '/api/reportes', 'reporte.registrar', true),
  auth('get', '/api/reportes/mios', 'reporte.listarMios', true),
  auth('get', '/api/reportes/mios/validacion', 'validacion.consultarEstadoMisReportes'),
  // validacion y denuncia (M5)
  auth('get', '/api/validaciones/pendientes', 'validacion.listarPendientes'),
  auth('get', '/api/reportes/12', 'validacion.obtenerReporte'),
  auth('get', '/api/reportes/12/confiabilidad', 'validacion.consultarConfiabilidad'),
  auth('post', '/api/reportes/12/validaciones', 'validacion.validar'),
  auth('post', '/api/reportes/12/denuncias', 'denuncia.denunciar'),
  // moderacion (M6)
  admin('get', '/api/admin/reportes-denunciados', 'moderacion.listarReportesDenunciados'),
  admin('get', '/api/admin/reportes-denunciados/12', 'moderacion.obtenerReporteDenunciado'),
  admin('post', '/api/admin/reportes-denunciados/12/resolucion', 'moderacion.resolverDenuncias'),
  admin('get', '/api/admin/usuarios', 'moderacion.listarUsuarios'),
  admin('get', '/api/admin/usuarios/12', 'moderacion.obtenerUsuario'),
  admin('post', '/api/admin/usuarios/12/suspension', 'moderacion.suspender'),
  admin('post', '/api/admin/usuarios/12/reactivacion', 'moderacion.reactivar'),
];
