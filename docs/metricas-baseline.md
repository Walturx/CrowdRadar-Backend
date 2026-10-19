# Métricas de línea base (antes de optimizar)

Medición tomada **antes de cualquier cambio de rendimiento o de pruebas**, sobre la rama `feat/crowdradar-v2-final`
(HEAD de código `35ebb86`, más los commits de herramientas de bench `478666b` y `80d55fe`, que no tocan `src/`).
Sirve como referencia para comparar las fases siguientes con los mismos comandos.

## Entorno de medición

| Elemento | Valor |
|---|---|
| Fecha | 2026-10-18 (hora local America/Lima, ~20:10-20:20) |
| CPU | AMD Ryzen 5 7600X, 6 núcleos / 12 hilos |
| RAM | 31,1 GB (VM de Docker Desktop: 12 CPU, 15,2 GB) |
| SO | Windows 11 Pro 10.0.26200 |
| Node (host: pruebas y autocannon) | v24.12.0 |
| Node (contenedor `api`) | v22.23.3 (`node:22-alpine`) |
| Docker | 29.1.3; Compose v2.40.3-desktop.1 |
| PostgreSQL | 16-alpine (compose, `127.0.0.1:55432`); pruebas con BD: `crowdradar-testdb` postgres:16 en `127.0.0.1:54329` |

Ruido conocido: durante la medición Docker Desktop tenía además en ejecución otros dos stacks ajenos al proyecto
(Supabase local, ~25 contenedores en reposo). La API registra cada petición con pino (`LOG_NIVEL=info`) a stdout del
contenedor. Ambos factores forman parte de esta línea base y deben mantenerse iguales al comparar.

## Fase 0: estado de compilación

| Comando | Resultado |
|---|---|
| `npm run build` | 0 errores (exit 0) |
| `npm run lint` (`tsc --noEmit` + ESLint) | 0 errores (exit 0) |
| `docker compose up -d --build` | `postgres` sano, `migrate` terminó OK, `api` arriba; `GET /api/salud` → 200; `GET /api/admin/reportes-denunciados` sin token → 401 `NO_AUTENTICADO` |

No hizo falta ningún commit de corrección.

## 1. Pruebas: tiempos y cobertura

Las pruebas con base de datos son opcionales: se activan con la variable `DATABASE_URL_TEST` (sin ella,
`describe.skipIf` las omite). Para las corridas "con BD" se usó
`DATABASE_URL_TEST=postgres://crowdradar:<password>@127.0.0.1:54329/crowdradar_test` (contenedor `crowdradar-testdb`;
la base `crowdradar_test` se creó para esta medición). Cobertura: `npm run test:cov` (ya existía; Vitest + `@vitest/coverage-v8`,
`include: src/**/*.ts`). Tiempo de pared medido desde la terminal, una corrida por comando.

| Comando | BD incluida | Tiempo de pared | Duración Vitest | Archivos | Pruebas |
|---|---|---|---|---|---|
| `npm test` | No | 16,6 s | 15,6 s | 132 OK, 17 omitidos (149) | 1896 OK, 162 omitidas, 0 fallidas |
| `npm run test:cov` | No | 25,6 s | 18,9 s | 132 OK, 17 omitidos | 1896 OK, 162 omitidas, 0 fallidas |
| `npm run test:db` | Sí | 40,6 s | 39,5 s | 149 OK | 2058 OK, 0 fallidas |
| `npm run test:cov` + `DATABASE_URL_TEST` | Sí | 37,0 s | 31,8 s | 149 OK | 2058 OK, 0 fallidas |

Nota: la primera corrida de `npm test` en frío reportó 20,3 s de Vitest; el valor de la tabla es la segunda corrida.

| Cobertura (`All files`) | Sentencias | Ramas | Funciones | Líneas |
|---|---|---|---|---|
| Sin BD | 87,99 % | **84,26 %** | 82,65 % | **88,99 %** |
| Con BD | 98,08 % | **95,23 %** | 98,03 % | **98,54 %** |

## 2. Benchmarks de carga

### Cómo reproducir

```bash
docker compose up -d --build
npm run bench -- --seed          # siembra datos de bench y corre los 5 escenarios (30 s, 50 conexiones, 3 s de calentamiento)
npm run bench -- --escenario=historial,reportes --duracion=10 --conexiones=20
npm run bench:seed -- --solo-limpiar   # elimina los datos de bench
```

- **Datos** (`scripts/bench/seed.mjs`, repetible: borra y vuelve a insertar sólo filas de bench): 200 lugares
  (`osm_id >= 9e9`, 6 categorías, dentro de Lima), 100 usuarios `benchNNN@bench.crowdradar.local`, 5000 reportes
  repartidos en los últimos 7 días (todos con más de 35 min de antigüedad) y 361 denuncias pendientes sobre 150
  reportes (8 páginas de 20). Se suman a los datos ya presentes en la BD de docker (45 lugares, 9 usuarios, 10 788
  reportes del historial sintético).
- **Sesiones**: el admin (`ADMIN_EMAIL`/`ADMIN_PASSWORD` del `.env`) y `bench001` inician sesión por
  `POST /api/auth/login`. El limitador de login permite 10 intentos por IP cada 15 min, así que los otros 99 usuarios
  reciben un token firmado con el `JWT_SECRETO` de la API (mismos claims HS256); `autenticar` igualmente relee cada
  usuario de la BD en cada petición.
- **Latencias**: p50/p95/p99 calculados por el runner sobre el tiempo de **todas** las respuestas medidas (el
  histograma de autocannon no expone p95). El JSON completo queda en `bench-results/` (ignorado por git).

| Escenario | Petición |
|---|---|
| lugares | `GET /api/lugares?bbox=-77.15,-12.25,-76.85,-11.9` (devuelve 200 lugares, ~26 KB) |
| explorar | `GET /api/lugares/explorar?lat=-12.08&lng=-77.03&radioKm=5` |
| historial | `GET /api/lugares/:id/historial?desde=<hoy-6>&hasta=<hoy>` (agrupación HORA), rotando los 200 lugares de bench |
| denunciados | `GET /api/admin/reportes-denunciados?page=1..8&size=20` como admin |
| reportes | `POST /api/reportes` con un par (usuario, lugar) distinto por petición (100 × 200 = 20 000 pares), así el cooldown de 30 min no se alcanza |

### Resultados (30 s, 50 conexiones, tras 3 s de calentamiento)

| Endpoint | p50 (ms) | p95 (ms) | p99 (ms) | máx (ms) | req/s prom. | Total | 2xx | 4xx (sin 429) | 429 | 5xx | Errores / timeouts |
|---|---|---|---|---|---|---|---|---|---|---|---|
| GET /api/lugares | 141,1 | 176,0 | 197,2 | 881 | 343,4 | 10 301 | 10 301 | 0 | 0 | 0 | 0 / 0 |
| GET /api/lugares/explorar | 78,4 | 104,0 | 128,3 | 439 | 612,2 | 18 366 | 18 366 | 0 | 0 | 0 | 0 / 0 |
| GET /api/lugares/:id/historial | 87,2 | 108,6 | 121,9 | 315 | 556,5 | 16 696 | 16 696 | 0 | 0 | 0 | 0 / 0 |
| GET /api/admin/reportes-denunciados | **652,6** | **824,0** | **982,2** | 1123 | **74,2** | 2 225 | 2 225 | 0 | 0 | 0 | 0 / 0 |
| POST /api/reportes | **400,7** | 519,6 | 562,9 | 752 | 121,9 | 3 658 | 3 658 (201) | 0 | 0 | 0 | 0 / 0 |

Ningún escenario devolvió 4xx, 429 ni 5xx: todas las peticiones fueron válidas. Contraste con el histograma de
autocannon (p50 / p97,5 / p99): lugares 141/183/197, explorar 78/113/128, historial 87/115/121, denunciados
652/864/982, reportes 400/545/562; coincide con el cálculo propio.

## 3. Observaciones para fases siguientes

### N+1 en `listarReportesDenunciados`

`ModeracionFacadeImpl.listarReportesDenunciados` obtiene la página con 2 consultas (`COUNT(DISTINCT reporte_id)` y el
`GROUP BY reporte_id ... LIMIT/OFFSET`) y luego, **por cada ítem**, llama a `contextoDe(reporteId)`: 1 consulta del
reporte y otras 2 en paralelo (lugar y autor). Son `2 + 3·N` consultas de negocio más la de `autenticar`.

Conteo real con `log_statement=all` activado temporalmente en el Postgres de docker (una petición, página 1):

| `size` | Sentencias SQL registradas |
|---|---|
| 1 | 8 |
| 20 | **71** |
| 50 | **153** |

Confirmado el N+1 (≈ 3 consultas por ítem). La diferencia sobre `2 + 3·N + 1` son sentencias de sesión (`SET ...`)
de conexiones nuevas del pool, abiertas porque el `Promise.all` pide hasta 3·N conexiones a la vez (pool máx. 10).
Coincide con el peor resultado del bench (74 req/s, p50 653 ms). Como referencia, en la misma medición:
`GET /api/lugares` = 2 sentencias, `GET /api/lugares/explorar` = 2, `GET .../historial` = 5 y
`POST /api/reportes` = 17 (transacción con 2 `pg_advisory_xact_lock`, `SELECT ... FOR UPDATE` del lugar, insert,
karma y recálculo de saturación).

### Cómo agrupa `/historial` hoy

- La agrupación por **día y hora ya se hace en SQL** (`ReporteDAOSequelize.agregarPorHora`): `GROUP BY` de
  `to_char(fecha_hora AT TIME ZONE :zona, 'YYYY-MM-DD')` y `EXTRACT(HOUR FROM fecha_hora AT TIME ZONE :zona)`, con
  `AVG` del valor de nivel y `COUNT(*)`. El filtro usa el rango crudo de `fecha_hora`, compatible con el índice
  `ix_reporte_lugar_fecha (lugar_id, fecha_hora DESC)`.
- En JS (`AnaliticaServiceImpl.obtenerHistorial`) sólo se **re-pliegan** esas filas (como máximo 24 × 31):
  `porHoraDelDia` combina la misma hora de todos los días con promedio ponderado por muestras; con `agrupacion=DIA`,
  `porDia` combina las horas de cada día.
- Por petición se ejecutan además una consulta de existencia del lugar (`exigirLugar`) y `hayReportesSinteticos`
  (`EXISTS` con `JOIN usuario` y `email LIKE '%@sintetico.crowdradar.local'`, comodín inicial sin índice); ambas
  agregaciones van en paralelo con `Promise.all`.

### Códigos de error (`CodigoError`) con prueba de API (status + cuerpo)

"API" = petición HTTP real con supertest contra la app o el router (`*.api.test.ts`, `*.blackbox.test.ts`,
`*.contract.test.ts`). "Sólo unitaria" = el código sólo se verifica en `manejarErrores.unit.test.ts` /
`requerirRol.unit.test.ts` (traducción de excepción, sin pasar por una ruta real).

| Código | HTTP | Prueba API status + `code` | Dónde (ejemplo) |
|---|---|---|---|
| VALIDACION_FALLIDA | 400 / 413 | Sí | 21 archivos API |
| JSON_INVALIDO | 400 | Sí | `app/createApp.api.test.ts` |
| TOKEN_RECUPERACION_INVALIDO | 400 | Sí | `seguridad/recuperacion.api.test.ts` |
| RANGO_FECHAS_INVALIDO | 400 | Sí | `analitica/analitica.api.test.ts` |
| NO_AUTENTICADO | 401 | Sí | 15 archivos API |
| TOKEN_INVALIDO | 401 | Sí | `route/auth.usuario.api.test.ts` |
| CREDENCIALES_INVALIDAS | 401 | Sí (cuerpo completo) | `route/auth.usuario.api.test.ts` |
| CUENTA_SUSPENDIDA | 403 | Sí | `reporte/reportes.api.test.ts`, `moderacion/admin.api.test.ts` |
| ACCESO_DENEGADO | 403 | Sí | `route/rutas.api.test.ts`, `moderacion/GET-usuarios.blackbox.test.ts` |
| RUTA_NO_ENCONTRADA | 404 | Sí | `app/createApp.api.test.ts` |
| CUENTA_NO_EXISTE | 404 | Sí | `route/auth.usuario.api.test.ts` |
| USUARIO_NO_ENCONTRADO | 404 | **Parcial**: sólo `body.code`, el status no se afirma en la misma prueba | `moderacion/admin.api.test.ts:122,180` |
| LUGAR_NO_ENCONTRADO | 404 | Sí | 7 archivos API |
| REPORTE_NO_ENCONTRADO | 404 | Sí | `validacion/validaciones.api.test.ts`, `moderacion/admin.api.test.ts` |
| FAVORITO_NO_ENCONTRADO | 404 | Sí | `favoritoAlerta/favoritos.api.test.ts` |
| ALERTA_NO_ENCONTRADA | 404 | Sí | `favoritoAlerta/alertas.api.test.ts` |
| EMAIL_DUPLICADO | 409 | Sí (cuerpo completo) | `route/auth.usuario.api.test.ts` |
| FAVORITO_DUPLICADO | 409 | Sí | `favoritoAlerta/favoritos.api.test.ts` |
| VALIDACION_DUPLICADA | 409 | Sí | `validacion/validaciones.api.test.ts` |
| DENUNCIA_DUPLICADA | 409 | Sí | `validacion/validaciones.api.test.ts` |
| USUARIO_YA_SUSPENDIDO | 409 | Sí | `moderacion/admin.api.test.ts` |
| USUARIO_NO_SUSPENDIDO | 409 | Sí | `moderacion/admin.api.test.ts` |
| SIN_DENUNCIAS_PENDIENTES | 409 | Sí | `moderacion/admin.api.test.ts` |
| CONFLICTO | 409 | **No** (sólo unitaria: `UniqueConstraintError` → 409) | `middleware/manejarErrores.unit.test.ts` |
| TOKEN_RECUPERACION_EXPIRADO | 410 | Sí | `seguridad/recuperacion.api.test.ts` |
| REPORTE_EN_ESPERA | 422 | Sí | `reporte/reportes.api.test.ts` |
| AUTOVALIDACION_NO_PERMITIDA | 422 | Sí | `validacion/validaciones.api.test.ts` |
| AUTODENUNCIA_NO_PERMITIDA | 422 | Sí | `validacion/validaciones.api.test.ts` |
| PASSWORD_ACTUAL_INCORRECTA | 422 | Sí | `seguridad/cambiarPassword.api.test.ts` |
| PASSWORD_REPETIDA | 422 | Sí | `route/auth.usuario.api.test.ts` |
| OPERACION_NO_PERMITIDA | 422 | Sí | `moderacion/admin.api.test.ts` |
| DEMASIADAS_SOLICITUDES | 429 | Sí, con `Retry-After` | `seguridad/recuperacion.api.test.ts`, `validacion/validaciones.api.test.ts` |
| DEMASIADOS_INTENTOS | 429 | Sí, con `Retry-After` | `route/auth.usuario.api.test.ts` |
| ERROR_INTERNO | 500 | Sí | `app/createApp.api.test.ts` |
| NO_IMPLEMENTADO | 501 | Sí | `route/rutas.api.test.ts` |
| SERVICIO_NO_DISPONIBLE | 503 | Sí, pero **sin `Retry-After`** a nivel API | `route/sistema.api.test.ts`, `reporte/reportes.api.test.ts` |
| APAGANDO | 503 | Sí, con `Retry-After` | `route/sistema.api.test.ts` |

### Estados HTTP con prueba de API

| Estado | ¿Prueba de API? | Comentario |
|---|---|---|
| 400 (zod, `VALIDACION_FALLIDA`) | Sí | Ampliamente cubierto (21 archivos). |
| 401 | Sí | `NO_AUTENTICADO`, `TOKEN_INVALIDO`, `CREDENCIALES_INVALIDAS`. |
| 403 | Sí | `ACCESO_DENEGADO` y `CUENTA_SUSPENDIDA`. |
| 404 | Sí | Falta afirmar el status junto con `USUARIO_NO_ENCONTRADO`. |
| 409 | Sí | Todos los códigos de negocio; `CONFLICTO` (genérico por restricción única) sólo unitario. |
| 429 | Sí | Con `Retry-After` (login, recuperación, validaciones). |
| 503 con `Retry-After` | **Sólo unitaria** para `SERVICIO_NO_DISPONIBLE` (statement_timeout 57014, transacción abortada, timeout del pool en `manejarErrores.unit.test.ts`); a nivel API sólo `APAGANDO` afirma `Retry-After`. |

Brechas a cubrir en la fase de pruebas: `CONFLICTO` vía una ruta real, status 404 en las pruebas de
`USUARIO_NO_ENCONTRADO`, y `503 SERVICIO_NO_DISPONIBLE` + `Retry-After` en una ruta real (p. ej. `lock_timeout`
durante `POST /api/reportes`).
