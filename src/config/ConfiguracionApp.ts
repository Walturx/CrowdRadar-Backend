import { MS_POR_MINUTO } from '../util/tiempo.js';
import { validarEntorno, type Entorno } from './esquemaEntorno.js';

function congelar<T>(valor: T): Readonly<T> {
  if (typeof valor === 'object' && valor !== null && !Object.isFrozen(valor)) {
    Object.values(valor).forEach(congelar);
    Object.freeze(valor);
  }
  return valor;
}

/**
 * Pattern: Singleton (fail-fast).
 *
 * Single immutable view of the process environment, validated once with zod.
 * `getInstance()` is called only from server.ts and container/ (dependency rule 4);
 * everything else receives the configuration by injection. An invalid environment
 * prints every offending key and exits with code 1 before the server listens.
 */
export class ConfiguracionApp {
  private static instancia: ConfiguracionApp | undefined;

  readonly servidor;
  readonly bd;
  readonly seguridad;
  readonly reglas;
  readonly lugares;
  readonly correo;
  readonly push;
  readonly semillas;

  private constructor(env: Entorno) {
    this.servidor = congelar({
      entorno: env.NODE_ENV,
      puerto: env.PUERTO,
      urlPublica: env.URL_PUBLICA,
      corsOrigenes: env.CORS_ORIGENES,
      logNivel: env.LOG_NIVEL,
      zonaHoraria: env.ZONA_HORARIA,
      trustProxy: env.TRUST_PROXY,
      limiteCuerpo: env.SERVIDOR_LIMITE_CUERPO,
      timeouts: {
        requestMs: env.SERVIDOR_REQUEST_TIMEOUT_MS,
        headersMs: env.SERVIDOR_HEADERS_TIMEOUT_MS,
        keepAliveMs: env.SERVIDOR_KEEPALIVE_TIMEOUT_MS,
        apagadoMs: env.APAGADO_TIMEOUT_MS,
      },
    });
    this.bd = congelar({
      host: env.DB_HOST,
      puerto: env.DB_PUERTO,
      nombre: env.DB_NOMBRE,
      usuario: env.DB_USUARIO,
      password: env.DB_PASSWORD,
      ssl: env.DB_SSL,
      pool: { max: env.DB_POOL_MAX, min: env.DB_POOL_MIN, acquireMs: env.DB_POOL_ACQUIRE_MS, idleMs: env.DB_POOL_IDLE_MS },
      statementTimeoutMs: env.DB_STATEMENT_TIMEOUT_MS,
      lockTimeoutMs: env.DB_LOCK_TIMEOUT_MS,
      reintentos: env.DB_REINTENTOS,
      reintentoEsperaMs: env.DB_REINTENTO_ESPERA_MS,
    });
    this.seguridad = congelar({
      jwtSecreto: env.JWT_SECRETO,
      jwtExpiraEn: env.JWT_EXPIRA_EN,
      bcryptCosto: env.BCRYPT_COSTO,
      politicaMensajesAuth: env.POLITICA_MENSAJES_AUTH,
      limites: {
        ventanaMin: env.LIMITE_VENTANA_MIN,
        ventanaMs: env.LIMITE_VENTANA_MIN * MS_POR_MINUTO,
        login: env.LIMITE_LOGIN,
        registro: env.LIMITE_REGISTRO,
        recuperar: env.LIMITE_RECUPERAR,
        restablecer: env.LIMITE_RESTABLECER,
        password: env.LIMITE_PASSWORD,
      },
    });
    this.reglas = congelar({
      recuperacionExpiraMin: env.RECUPERACION_EXPIRA_MIN,
      cooldownReporteMin: env.COOLDOWN_REPORTE_MIN,
      karmaPorReporte: env.KARMA_POR_REPORTE,
      karmaPorValidacion: env.KARMA_POR_VALIDACION,
      karmaReportesPremiadosDia: env.KARMA_REPORTES_PREMIADOS_DIA,
      saturacionEstrategia: env.SATURACION_ESTRATEGIA,
      saturacionVentanaMin: env.SATURACION_VENTANA_MIN,
      saturacionMinReportes: env.SATURACION_MIN_REPORTES,
      saturacionUmbralModerado: env.SATURACION_UMBRAL_MODERADO,
      saturacionUmbralSaturado: env.SATURACION_UMBRAL_SATURADO,
      confiabilidadEstrategia: env.CONFIABILIDAD_ESTRATEGIA,
      confiabilidadMinVotos: env.CONFIABILIDAD_MIN_VOTOS,
      confiabilidadUmbralAlta: env.CONFIABILIDAD_UMBRAL_ALTA,
      confiabilidadUmbralMedia: env.CONFIABILIDAD_UMBRAL_MEDIA,
      topeKarmaPeso: env.TOPE_KARMA_PESO,
      radioBusquedaKm: env.RADIO_BUSQUEDA_KM,
      radioPendientesKm: env.RADIO_PENDIENTES_KM,
      ventanaPendientesHoras: env.VENTANA_PENDIENTES_HORAS,
      analiticaMinMuestras: env.ANALITICA_MIN_MUESTRAS,
      analiticaHoraApertura: env.ANALITICA_HORA_APERTURA,
      analiticaHoraCierre: env.ANALITICA_HORA_CIERRE,
      suspensionDiasPermitidos: env.SUSPENSION_DIAS_PERMITIDOS,
      eventosPresupuestoMs: env.EVENTOS_PRESUPUESTO_MS,
      alertasConcurrencia: env.ALERTAS_CONCURRENCIA,
      dispositivosMaxPorUsuario: env.DISPOSITIVOS_MAX_POR_USUARIO,
    });
    this.lugares = congelar({
      qMin: env.LUGARES_Q_MIN,
      qMax: env.LUGARES_Q_MAX,
      limiteMax: env.LUGARES_LIMITE_MAX,
      limiteDefault: env.LUGARES_LIMITE_DEFAULT,
    });
    this.correo = congelar({
      proveedor: env.CORREO_PROVEEDOR,
      remitente: env.CORREO_REMITENTE,
      mostrarEnlaceDev: env.CORREO_MOSTRAR_ENLACE_DEV,
      smtp: { host: env.SMTP_HOST, puerto: env.SMTP_PUERTO, usuario: env.SMTP_USUARIO, password: env.SMTP_PASSWORD },
    });
    this.push = congelar({
      proveedor: env.PUSH_PROVEEDOR,
      fcmCredencialesRuta: env.FCM_CREDENCIALES_RUTA,
      timeoutMs: env.PUSH_TIMEOUT_MS,
    });
    this.semillas = congelar({ adminEmail: env.ADMIN_EMAIL, adminPassword: env.ADMIN_PASSWORD, sinteticos: env.SEED_SINTETICO ?? env.NODE_ENV !== 'production' });
  }

  /** Validates process.env once; on failure names every bad key and exits with code 1. */
  static getInstance(): ConfiguracionApp {
    if (!ConfiguracionApp.instancia) {
      const resultado = validarEntorno(process.env);
      if (!resultado.ok) {
        process.stderr.write(`${resultado.mensaje}\n`);
        process.exit(1);
      }
      ConfiguracionApp.instancia = new ConfiguracionApp(resultado.valor);
    }
    return ConfiguracionApp.instancia;
  }

  /** Drops the cached singleton. Only tests should call this. */
  static reiniciar(): void {
    ConfiguracionApp.instancia = undefined;
  }
}
