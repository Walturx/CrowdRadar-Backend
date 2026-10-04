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

const diasDeSuspension = z
  .string()
  .default('3,7,30')
  .transform((texto) => texto.split(',').map((item) => Number(item.trim())))
  .pipe(z.array(z.number().int().positive()).min(1));

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

    // database
    DB_HOST: z.string().default('localhost'),
    DB_PUERTO: entero(5432, 1, 65535),
    DB_NOMBRE: z.string().default('crowdradar'),
    DB_USUARIO: z.string().default('crowdradar'),
    DB_PASSWORD: requerida('es obligatoria'),
    DB_SSL: z.stringbool().default(false),

    // security
    JWT_SECRETO: z
      .string({ error: 'es obligatorio' })
      .min(32, 'debe tener al menos 32 caracteres'),
    JWT_EXPIRA_EN: z.string().default('2h'),
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
    ADMIN_PASSWORD: z.string().optional(),
    SEED_DEMO: z.stringbool().default(false),
  })
  .superRefine((entorno, ctx) => {
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
