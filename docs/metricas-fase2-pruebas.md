# Métricas de la fase 2: pruebas

Continuación de [`metricas-baseline.md`](metricas-baseline.md). Esta fase sólo agrega o endurece pruebas; no cambia
código de producción. Mismos comandos y mismo entorno que la línea base (BD de pruebas: contenedor
`crowdradar-testdb`, `DATABASE_URL_TEST=postgres://crowdradar:<password>@127.0.0.1:54329/crowdradar_test`).

## Cobertura (`All files`)

| Corrida | Líneas | Ramas | Sentencias | Funciones |
|---|---|---|---|---|
| Sin BD, línea base | 88,99 % | 84,26 % | 87,99 % | 82,65 % |
| **Sin BD, fase 2** (`npm run test:cov`) | **90,29 %** | **85,45 %** | 89,47 % | 84,61 % |
| Con BD, línea base | 98,54 % | 95,23 % | 98,08 % | 98,03 % |
| **Con BD, fase 2** (`test:cov` + `DATABASE_URL_TEST`) | **99,78 %** | **96,18 %** | 99,52 % | 99,84 % |

Lo que queda sin cubrir sin BD son, sobre todo, los DAO de Sequelize (`src/dao/impl/sequelize`), que sólo se ejercitan
contra Postgres (contratos compartidos con los DAO en memoria). `src/route/stub.ts` ahora se cubre con una prueba de API.

## Guardia contra 500 no manejados

`test/support/setupGuardiaErrorInterno.ts` (en `setupFiles` de `vitest.config.ts`) envuelve con `vi.mock` el middleware
de errores real (`crearManejadorErrores`). Si una petición termina en la rama genérica de `traducirError`
(`esInterno: true`, 500 `ERROR_INTERNO`), se registra método, URL y error; el `afterEach` global hace fallar la prueba
con ese detalle. Las pruebas que provocan un 500 a propósito lo declaran con `permitirErrorInterno()` (hoy 5: las que
verifican que el 500 oculta detalles internos y lleva `requestId`). Los errores mapeados (4xx, 501, 503) no se registran.
La guardia se prueba a sí misma en `test/support/guardiaErrorInterno.unit.test.ts`. Alcance: toda app creada en proceso
(`createApp`, `crearAppPrueba`); no cubre el servidor lanzado como proceso hijo en `server.arranque.api.test.ts`.

## `CodigoError` con prueba de API (status + cuerpo)

37 de 37 códigos. Cambios respecto de la línea base:

| Código | HTTP | Antes | Ahora |
|---|---|---|---|
| CONFLICTO | 409 | Sólo unitaria | `seguridad/recuperacion.api.test.ts` (colisión de token de recuperación) y `reporte/reportes.api.test.ts` (índice único no traducido por el DAO; no filtra el nombre del índice) |
| SERVICIO_NO_DISPONIBLE | 503 | Sin `Retry-After` en API | `Retry-After: 5` y sobre exacto (`support/erroresBD.ts#esperar503Reintentable`) en `/api/salud` (2 casos), `POST /api/reportes` (lock_timeout 55P03), votos (deadlock 40P01), denuncias (ECONNREFUSED), favoritos (statement_timeout 57014) y `GET /recuperar/restablecer` |
| USUARIO_NO_ENCONTRADO | 404 | Sólo `body.code` | `moderacion/admin.api.test.ts`: detalle, suspensión y reactivación afirman 404 y el sobre completo |
| NO_IMPLEMENTADO | 501 | **Ninguna prueba se ejecutaba** (todas las rutas de `tablaRutas.ts` ya están entregadas, así que los casos 501 de `rutas.api.test.ts` no corren) | `app/createApp.api.test.ts`: el stub real `noImplementado` montado en la app completa |

Estados HTTP con prueba de API: 400 (zod), 401, 403, 404, 409, 429 (con `Retry-After`) y 503 (con `Retry-After`).

## Pruebas sin flakiness

Corridas consecutivas tras los cambios de esta fase:

| Comando | Corrida 1 | Corrida 2 | Corrida 3 |
|---|---|---|---|
| `npm test` | 1922 OK, 162 omitidas, 0 fallidas (17,7 s) | igual (14,6 s) | igual (16,7 s) |
| `npm run test:db` | 2084 OK, 0 fallidas (34,1 s) | igual (30,1 s) | igual (28,9 s) |

No apareció ninguna prueba inestable, así que no hizo falta corregir nada. Riesgo latente (no observado): cinco pruebas
miden presupuestos de tiempo con reloj real (`Date.now()`, umbrales de 100 a 1500 ms), por ejemplo
`reporte/ReporteFacade.eventos.unit.test.ts` (< 100 ms) y `reporte/contenedorReporte.unit.test.ts` (< 150 ms); con la CPU
muy cargada podrían fallar. Si eso pasa, conviene pasarlas a temporizadores falsos.
