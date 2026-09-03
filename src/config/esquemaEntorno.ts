import { z } from 'zod';

/** Integer env value with default and inclusive bounds. */
const entero = (porDefecto: number, minimo = 0, maximo = Number.MAX_SAFE_INTEGER) =>
  z.coerce.number().int().min(minimo).max(maximo).default(porDefecto);

/** Positive decimal env value with default. */
const decimal = (porDefecto: number) => z.coerce.number().positive().default(porDefecto);

/** Comma separated env value split into trimmed, non-empty items. */
const lista = (porDefecto: string) =>
  z
    .string()
    .default(porDefecto)
    .transform((texto) =>
      texto
        .split(',')
        .map((item) => item.trim())
        .filter((item) => item.length > 0),
    );

/**
 * sancion_usuario.dias has a database CHECK (dias IN (3, 7, 30)) in migration 06, which is frozen.
 * A configured value outside that set would pass validation here and fail at INSERT time, so the
 * environment is only valid when SUSPENSION_DIAS_PERMITIDOS is a subset of it.
 */
const DIAS_SOPORTADOS_POR_LA_BD = [3, 7, 30];

const diasDeSuspension = z
  .string()
  .default('3,7,30')
  .transform((texto) => texto.split(',').map((item) => Number(item.trim())))
  .pipe(
    z
      .array(z.number().int().positive())
      .min(1)
      .refine((dias) => dias.every((dia) => DIAS_SOPORTADOS_POR_LA_BD.includes(dia)), {
        message: `solo admite valores de ${DIAS_SOPORTADOS_POR_LA_BD.join(', ')} (CHECK de sancion_usuario.dias)`,
      }),
  );

/** Secrets must be replaced: values copied from .env.example start with CAMBIAR and are rejected. */
const sinPlaceholder = (valor: string) => !valor.startsWith('CAMBIAR');
const MENSAJE_PLACEHOLDER = 'es un valor de ejemplo (empieza con CAMBIAR); defina uno real';

/** Express `trust proxy`: true/false, a number of hops, or a name/CIDR list such as "loopback". */
const confiarProxy = z
  .string()
  .default('false')
  .transform((texto): boolean | number | string => {
    const valor = texto.trim();
    if (valor === 'true') return true;
    if (valor === 'false') return false;
    return /^\d+$/.test(valor) ? Number(valor) : valor;
  });

const requerida =(mensaje: string) => z.string({ error: mensaje }).min(1, mensaje);

/**
 * Environment schema: every key the backend reads, with the design defaults.
 * Messages never echo the offending value so secrets cannot leak into logs.
 */
export const esquemaEntorno = z
  .object({
    // server
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PUERTO: entero(3000, 1, 65535),
    URL_PUBLICA: z.string().default('http://localhost:3000'),
    CORS_ORIGENES: lista('http://localhost:3000'),
    LOG_NIVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
    ZONA_HORARIA: z.string().default('America/Lima'),
    TRUST_PROXY: confiarProxy,
    // body-parser size string: integer + b, kb or mb (e.g. 100kb)
    SERVIDOR_LIMITE_CUERPO: z
      .string()
      .regex(/^[1-9]\d*(b|kb|mb)$/i, 'debe ser un entero positivo con unidad b, kb o mb (ej. 100kb)')
      .default('100kb'),
    SERVIDOR_REQUEST_TIMEOUT_MS: entero(30000, 1000),
    SERVIDOR_HEADERS_TIMEOUT_MS: entero(66000, 1000),
    // Above the usual load balancer idle timeout (60 s) so the balancer, not Node, closes idle connections.
    SERVIDOR_KEEPALIVE_TIMEOUT_MS: entero(65000, 1),
    // Above SERVIDOR_REQUEST_TIMEOUT_MS so in-flight requests can finish before the forced exit.
    APAGADO_TIMEOUT_MS: entero(35000, 1),

    // database
    DB_HOST: z.string().default('localhost'),
    DB_PUERTO: entero(5432, 1, 65535),
    DB_NOMBRE: z.string().default('crowdradar'),
    DB_USUARIO: z.string().default('crowdradar'),
    DB_PASSWORD: requerida('es obligatoria').refine(sinPlaceholder, MENSAJE_PLACEHOLDER),
    DB_SSL: z.stringbool().default(false),
    DB_POOL_MAX: entero(10, 1),
    DB_POOL_MIN: entero(0, 0),
    DB_POOL_ACQUIRE_MS: entero(30000, 1),
    DB_POOL_IDLE_MS: entero(10000, 1),
    DB_STATEMENT_TIMEOUT_MS: entero(15000, 1),
    DB_REINTENTOS: entero(5, 1),
    DB_REINTENTO_ESPERA_MS: entero(500, 1),

    // security
    JWT_SECRETO: z
      .string({ error: 'es obligatorio' })
      .min(32, 'debe tener al menos 32 caracteres')
      .refine(sinPlaceholder, MENSAJE_PLACEHOLDER),
    JWT_EXPIRA_EN: z
      .string()
      .regex(/^[1-9]\d*(s|m|h|d)$/, 'debe ser un entero positivo con unidad s, m, h o d (ej. 2h)')
      .default('2h'),
    BCRYPT_COSTO: entero(10, 4, 15),
    POLITICA_MENSAJES_AUTH: z.enum(['GENERICA', 'DETALLADA']).default('GENERICA'),
    LIMITE_VENTANA_MIN: entero(15, 1),
    LIMITE_LOGIN: entero(10, 1),
    LIMITE_REGISTRO: entero(10, 1),
    LIMITE_RECUPERAR: entero(5, 1),
    LIMITE_RESTABLECER: entero(10, 1),
    LIMITE_PASSWORD: entero(5, 1),

    // business rules
    RECUPERACION_EXPIRA_MIN: entero(30, 1),
    COOLDOWN_REPORTE_MIN: entero(30, 0),
    KARMA_POR_REPORTE: entero(10, 0),
    KARMA_POR_VALIDACION: entero(2, 0),
    KARMA_REPORTES_PREMIADOS_DIA: entero(5, 0),
    SATURACION_ESTRATEGIA: z.enum(['PONDERADA', 'ULTIMO_REPORTE']).default('PONDERADA'),
    SATURACION_VENTANA_MIN: entero(60, 1),
    SATURACION_MIN_REPORTES: entero(3, 1),
    SATURACION_UMBRAL_MODERADO: decimal(1.67),
    SATURACION_UMBRAL_SATURADO: decimal(2.34),
    CONFIABILIDAD_ESTRATEGIA: z.enum(['PONDERADA_KARMA', 'SIMPLE']).default('PONDERADA_KARMA'),
    CONFIABILIDAD_MIN_VOTOS: entero(3, 1),
    CONFIABILIDAD_UMBRAL_ALTA: entero(70, 1, 100),
    CONFIABILIDAD_UMBRAL_MEDIA: entero(40, 1, 100),
    TOPE_KARMA_PESO: entero(500, 0),
    RADIO_BUSQUEDA_KM: decimal(2),
    RADIO_PENDIENTES_KM: decimal(5),
    VENTANA_PENDIENTES_HORAS: entero(3, 1, 24),
    ANALITICA_MIN_MUESTRAS: entero(5, 1),
    SUSPENSION_DIAS_PERMITIDOS: diasDeSuspension,

    // mail and push providers
    CORREO_PROVEEDOR: z.enum(['consola', 'smtp']).default('consola'),
    CORREO_REMITENTE: z.string().default('CrowdRadar <no-responder@crowdradar.local>'),
    SMTP_HOST: z.string().optional(),
    SMTP_PUERTO: entero(587, 1, 65535),
    SMTP_USUARIO: z.string().optional(),
    SMTP_PASSWORD: z.string().optional(),
    PUSH_PROVEEDOR: z.enum(['consola', 'fcm']).default('consola'),
    FCM_CREDENCIALES_RUTA: z.string().optional(),

    // seeds
    ADMIN_EMAIL: z.string().optional(),
    ADMIN_PASSWORD: z.string().min(10, 'debe tener al menos 10 caracteres').refine(sinPlaceholder, MENSAJE_PLACEHOLDER).optional(),
    SEED_DEMO: z.stringbool().default(false),
  })
  .superRefine((entorno, ctx) => {
    if (entorno.DB_POOL_MIN > entorno.DB_POOL_MAX) {
      ctx.addIssue({ code: 'custom', path: ['DB_POOL_MIN'], message: 'no puede superar DB_POOL_MAX' });
    }
    // Node guidance: headersTimeout above keepAliveTimeout, or idle keep-alive connections get cut mid-reuse.
    // (Node only checks headers <= request in the http.Server constructor; the app assigns the values afterwards.)
    if (entorno.SERVIDOR_HEADERS_TIMEOUT_MS <= entorno.SERVIDOR_KEEPALIVE_TIMEOUT_MS) {
      ctx.addIssue({
        code: 'custom',
        path: ['SERVIDOR_HEADERS_TIMEOUT_MS'],
        message: 'debe ser mayor que SERVIDOR_KEEPALIVE_TIMEOUT_MS',
      });
    }
    if (entorno.APAGADO_TIMEOUT_MS <= entorno.SERVIDOR_REQUEST_TIMEOUT_MS) {
      ctx.addIssue({
        code: 'custom',
        path: ['APAGADO_TIMEOUT_MS'],
        message: 'debe ser mayor que SERVIDOR_REQUEST_TIMEOUT_MS',
      });
    }
    if (entorno.CORREO_PROVEEDOR === 'smtp') {
      for (const clave of ['SMTP_HOST', 'SMTP_USUARIO', 'SMTP_PASSWORD'] as const) {
        if (!entorno[clave]) {
          ctx.addIssue({ code: 'custom', path: [clave], message: 'es obligatoria con CORREO_PROVEEDOR=smtp' });
        }
      }
    }
    if (entorno.PUSH_PROVEEDOR === 'fcm' && !entorno.FCM_CREDENCIALES_RUTA) {
      ctx.addIssue({ code: 'custom', path: ['FCM_CREDENCIALES_RUTA'], message: 'es obligatoria con PUSH_PROVEEDOR=fcm' });
    }
  });

export type Entorno = z.infer<typeof esquemaEntorno>;

export type ResultadoEntorno =
  | { ok: true; valor: Entorno }
  | { ok: false; claves: string[]; mensaje: string };

/** Validates a raw environment; empty strings count as absent. */
export function validarEntorno(env: Record<string, string | undefined>): ResultadoEntorno {
  const limpio = Object.fromEntries(Object.entries(env).filter(([, valor]) => valor !== undefined && valor !== ''));
  const resultado = esquemaEntorno.safeParse(limpio);
  if (resultado.success) return { ok: true, valor: resultado.data };

  const detalles = resultado.error.issues.map((issue) => ({
    clave: String(issue.path[0] ?? '(entorno)'),
    mensaje: issue.message,
  }));
  const claves = [...new Set(detalles.map((detalle) => detalle.clave))].sort();
  const lineas = detalles.map((detalle) => `  - ${detalle.clave}: ${detalle.mensaje}`);
  return {
    ok: false,
    claves,
    mensaje: `Configuracion invalida. Corrija estas variables de entorno:\n${lineas.join('\n')}`,
  };
}
