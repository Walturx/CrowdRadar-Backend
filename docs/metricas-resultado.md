# Métricas de resultado (antes / después)

Medición final del backend tras las fases 0, 2, 3 y 4 del plan, con los mismos comandos y el mismo equipo que la línea
base ([`metricas-baseline.md`](metricas-baseline.md)) y la fase de pruebas ([`metricas-fase2-pruebas.md`](metricas-fase2-pruebas.md)).
"Antes" = línea base (código `35ebb86`); "Después" = HEAD `2fed5c1` de `feat/crowdradar-v2-final`.
Las métricas del frontend están en el repositorio Flutter, en `docs/metricas-resultado.md`.

## Entorno de medición

| Elemento | Valor |
|---|---|
| Fecha | 2026-10-18, ~22:55-23:10 (America/Lima) |
| CPU / RAM | AMD Ryzen 5 7600X (6 núcleos / 12 hilos), 31,1 GB; VM de Docker Desktop: 12 CPU, 15,2 GB |
| SO | Windows 11 Pro 10.0.26200 |
| Node | host v24.12.0 (pruebas y autocannon); contenedor `api` v22.23.3 (`node:22-alpine`) |
| Docker | 29.1.3; Compose v2.40.3-desktop.1 |
| PostgreSQL | 16-alpine (compose, `127.0.0.1:55432`); pruebas con BD: `crowdradar-testdb` en `127.0.0.1:54329` |
| Despliegue | `docker compose up -d --build`; `migrate` OK (migración 14 `usuario-indice-sintetico` ya aplicada: 13 de 13 en `SequelizeMeta`), `GET /api/salud` → 200, `GET /api/admin/reportes-denunciados` sin token → 401 `NO_AUTENTICADO` |
| Datos de bench | `npm run bench -- --seed` antes de cada ronda: 200 lugares, 100 usuarios, 5000 reportes, 361 denuncias sobre 150 reportes (igual que la línea base) |

## Fase 0: compilación

| Métrica | Antes | Después | Meta | ¿Cumplida? |
|---|---|---|---|---|
| `npm run build` | 0 errores | 0 errores | 0 errores | Cumplida |
| `npm run lint` (`tsc --noEmit` + ESLint) | 0 errores | 0 errores | 0 errores | Cumplida |

## Fase 2: pruebas

| Métrica | Antes | Después | Meta | ¿Cumplida? |
|---|---|---|---|---|
| Cobertura de líneas, sin BD (`npm run test:cov`) | 88,99 % | **91,22 %** | ≥ 90 % | Cumplida |
| Cobertura de ramas, sin BD | 84,26 % | **86,68 %** | ≥ 85 % | Cumplida |
| Cobertura de líneas, con BD (`test:cov` + `DATABASE_URL_TEST`) | 98,54 % | **99,79 %** | ≥ 90 % | Cumplida |
| Cobertura de ramas, con BD | 95,23 % | **96,13 %** | ≥ 85 % | Cumplida |
| `CodigoError` con prueba de API (status + cuerpo) | 33 de 37 (`CONFLICTO` sólo unitaria, `USUARIO_NO_ENCONTRADO` parcial, `SERVICIO_NO_DISPONIBLE` sin `Retry-After`, `NO_IMPLEMENTADO` con pruebas que no se ejecutaban) | **37 de 37** | 37 de 37 | Cumplida |
| Estados con prueba de API: 400/401/403/404/409/429/503 + `Retry-After` | 503 + `Retry-After` sólo para `APAGANDO` | Todos, 503 `SERVICIO_NO_DISPONIBLE` con `Retry-After: 5` en 6 rutas | Todos | Cumplida |
| 500 no manejados | Sin guardia | Guardia global `test/support/setupGuardiaErrorInterno.ts` (`setupFiles`); toda prueba con un 500 inesperado falla | Guardia activa, 0 500 no declarados | Cumplida |
| Flakiness, `npm test` (3 corridas) | No medido | 3 de 3 idénticas: 1970 OK, 179 omitidas, 0 fallidas | 0 inestables | Cumplida |
| Flakiness, `npm run test:db` | No medido | 5 de 6 corridas idénticas (2149 OK); 1 corrida con 1 suite fallida por `connect EADDRINUSE 127.0.0.1:54329` | 0 inestables | **No cumplida (parcial)** |

Detalle de la corrida fallida de `test:db` (corrida 2): `test/seguridad/restablecerConcurrente.contract.test.ts` falló en su
`beforeAll` porque el `sequelize-cli db:migrate` lanzado como proceso hijo no pudo abrir la conexión: Windows devolvió
`EADDRINUSE` al asignar el puerto local efímero (había ~4700 sockets en `TIME_WAIT` tras las corridas seguidas). No es una
aserción de la prueba la que falla, sino el entorno; las otras 5 corridas, antes y después, pasaron completas. Aun así no
se puede afirmar "0 flaky" para la suite con BD. Opciones: reintentar la migración del `beforeAll` ante `EADDRINUSE`, o
reutilizar una sola base migrada por archivo en vez de lanzar el CLI por suite.

### Tiempos y conteos de pruebas

| Comando | Antes | Después | Archivos | Pruebas |
|---|---|---|---|---|
| `npm test` (pared) | 16,6 s (1 corrida) | **6,90 s** mediana (6,90 / 7,16 / 6,76 s); Vitest 5,97 / 6,13 / 5,82 s | 140 OK, 19 omitidos (159) | 1970 OK, 179 omitidas, 0 fallidas |
| `npm run test:cov` sin BD (pared) | 25,6 s | 13,7 s (Vitest 7,97 s) | 140 OK, 19 omitidos | 1970 OK, 179 omitidas |
| `npm run test:db` (pared) | 40,6 s | **27,8 s** mediana de las 3 primeras (30,4 / 27,8* / 27,7 s); otras 3: 28,1 / 28,7 / 27,4 s | 159 OK | 2149 OK, 0 fallidas |
| `npm run test:cov` con BD (pared) | 37,0 s | 33,7 s (Vitest 27,7 s) | 159 OK | 2149 OK |

\* corrida con el fallo de entorno descrito arriba (2148 OK, 1 suite fallida).

| Cobertura (`All files`) | Sentencias | Ramas | Funciones | Líneas |
|---|---|---|---|---|
| Sin BD, antes | 87,99 % | 84,26 % | 82,65 % | 88,99 % |
| Sin BD, después | 90,56 % | 86,68 % | 86,65 % | 91,22 % |
| Con BD, antes | 98,08 % | 95,23 % | 98,03 % | 98,54 % |
| Con BD, después | 99,53 % | 96,13 % | 99,85 % | 99,79 % |

## Fase 3: rendimiento

Bench: `npm run bench` (autocannon, 30 s, 50 conexiones, 3 s de calentamiento), 2 rondas completas, cada una precedida
de `--seed`. Para cada métrica se informa la mediana de las 2 rondas (con 2 valores, su promedio) y entre paréntesis
ronda 1 / ronda 2. El veredicto de `POST /api/reportes` usa `--reportes-un-usuario`, el orden de la línea base.

| Métrica | Antes | Después | Meta | ¿Cumplida? |
|---|---|---|---|---|
| Consultas por página de `listarReportesDenunciados` (`size=20`) | 2 + 3·N de negocio; 71 sentencias por petición | **2 de negocio**, 3 sentencias por petición (con la de `autenticar`); igual con `size` 1, 20 y 50 | ≤ 2 por página | Cumplida |
| p95 `GET /api/admin/reportes-denunciados` | 824,0 ms | **121,5 ms** (125,2 / 117,7) | −50 % | Cumplida (−85,3 %) |
| p95 `GET /api/lugares/:id/historial` | 108,6 ms | **75,1 ms** (68,8 / 81,3) | −30 % | Cumplida (−30,9 %, justa: ronda 1 −36,6 %, ronda 2 −25,1 %) |
| p95 < 200 ms en los 5 endpoints | 3 de 5 (denunciados 824, reportes 520) | **4 de 5**: lugares 172,0, explorar 92,8, historial 75,1, denunciados 121,5; reportes **316,7** | 5 de 5 | **No cumplida** (POST /api/reportes) |
| Errores en los 5 endpoints (4xx, 429, 5xx, conexión, timeouts) | 0 % | 0 % en todas las corridas | 0 % | Cumplida |
| `npm test` (pared) | 16,6 s | 6,90 s | −25 % | Cumplida (−58,4 %) |
| `npm run bench` existe | Sí (agregado para la línea base) | Sí, más `--reportes-un-usuario` y documentación en el README | Existe | Cumplida |

Conteo de consultas: por dos vías. La prueba con BD `test/moderacion/listarDenunciados.consultas.contract.test.ts` afirma
`≤ 2` consultas para una página de 20 (y 0 consultas extra en páginas siguientes). De punta a punta, con `log_statement=all`
activado temporalmente en el Postgres de docker (luego `ALTER SYSTEM RESET log_statement`, verificado en `none`), una
petición registró: la lectura del usuario de `autenticar`, la página (`GROUP BY` con `COUNT(*) OVER ()` para el total) y
una lectura del contexto (reporte, lugar y autor) para todos los ítems.

### Resultados del bench (mediana de 2 rondas)

| Endpoint | p50 (ms) | p95 (ms) | p99 (ms) | req/s | Total | 2xx | 4xx | 429 | 5xx | Errores / timeouts |
|---|---|---|---|---|---|---|---|---|---|---|
| GET /api/lugares | 113,2 (102,6 / 123,9) | 172,0 (135,6 / 208,3) | 232,6 (176,9 / 288,2) | 421,9 (471,3 / 372,4) | 12 655 (14 138 / 11 171) | 100 % | 0 | 0 | 0 | 0 / 0 |
| GET /api/lugares/explorar | 65,6 (58,6 / 72,5) | 92,8 (78,4 / 107,3) | 117,8 (96,0 / 139,5) | 736,6 (821,7 / 651,5) | 22 097 (24 650 / 19 544) | 100 % | 0 | 0 | 0 | 0 / 0 |
| GET /api/lugares/:id/historial | 55,3 (54,2 / 56,5) | 75,1 (68,8 / 81,3) | 91,7 (84,8 / 98,6) | 868,3 (897,2 / 839,3) | 26 047 (26 915 / 25 178) | 100 % | 0 | 0 | 0 | 0 / 0 |
| GET /api/admin/reportes-denunciados | 90,6 (90,8 / 90,4) | 121,5 (125,2 / 117,7) | 149,1 (160,6 / 137,5) | 530,8 (525,3 / 536,2) | 15 922 (15 758 / 16 086) | 100 % | 0 | 0 | 0 | 0 / 0 |
| POST /api/reportes, `--reportes-un-usuario` (comparable) | 232,9 (239,4 / 226,3) | 316,7 (353,0 / 280,4) | 443,7 (584,2 / 303,1) | 205,9 (195,4 / 216,3) | 6 176 (5 862 / 6 490) | 100 % (201) | 0 | 0 | 0 | 0 / 0 |
| POST /api/reportes, rotación por defecto (no comparable) | 154,5 (157,4 / 151,6) | 197,4 (210,2 / 184,6) | 241,9 (273,3 / 210,5) | 313,0 (303,0 / 322,9) | 9 389 (9 089 / 9 688) | 100 % (201) | 0 | 0 | 0 | 0 / 0 |

### Antes / después por endpoint (p95 y throughput)

| Endpoint | p95 antes | p95 después | Cambio | req/s antes | req/s después | Cambio |
|---|---|---|---|---|---|---|
| GET /api/lugares | 176,0 | 172,0 | −2,3 % | 343,4 | 421,9 | +22,9 % |
| GET /api/lugares/explorar | 104,0 | 92,8 | −10,8 % | 612,2 | 736,6 | +20,3 % |
| GET /api/lugares/:id/historial | 108,6 | 75,1 | −30,9 % | 556,5 | 868,3 | +56,0 % |
| GET /api/admin/reportes-denunciados | 824,0 | 121,5 | −85,3 % | 74,2 | 530,8 | ×7,2 |
| POST /api/reportes (un usuario) | 519,6 | 316,7 | −39,0 % | 121,9 | 205,9 | +68,9 % |

### Por qué `POST /api/reportes` sigue por encima de 200 ms

- Con el orden de la línea base, 50 conexiones envían 200 peticiones seguidas del **mismo usuario**, y todas esperan el
  mismo `pg_advisory_xact_lock(usuario, 0)` del karma. Ese bloqueo se mantiene a propósito para que el tope diario de
  karma sea exacto; la mayor parte del p95 es espera en ese bloqueo, no trabajo. Con la rotación por defecto (usuarios y
  lugares distintos entre peticiones consecutivas, como el tráfico real) el p95 baja a 197,4 ms, pero esa medición no es
  comparable con la línea base y no se usa para el veredicto.
- La transacción ya está en su mínimo razonable sin aflojar garantías: pasó de 16 a 13 sentencias (`6fd399f`), el
  karma se otorga al final para retener el bloqueo menos tiempo (`44ddd4e`) y las sentencias calientes son SQL escrito
  a mano (`83e910c`). Lo que queda son los dos bloqueos de aviso, el `SELECT ... FOR UPDATE` del lugar, el insert, el
  karma y el recálculo de saturación.
- La API es un único proceso Node: con 50 conexiones el bucle de eventos queda ocupado (CPU) y además se registra cada
  petición con pino (`LOG_NIVEL=info`) a stdout del contenedor.
- Opciones con sus costos: modo cluster o varias réplicas de `api` (más throughput y menos cola; más conexiones al pool
  de Postgres), bajar el log de peticiones a `warn` en producción (menos CPU; se pierde traza por petición), o relajar el
  tope de karma a eventual (elimina la espera del bloqueo; el tope diario podría excederse por poco).

## Fase 4 (parte backend): diagramas

| Métrica | Antes | Después | Meta | ¿Cumplida? |
|---|---|---|---|---|
| Diagramas PlantUML | 0 | **9**: backend `componentes`, `er`, `secuencia-crear-reporte`, `secuencia-login-jwt`, `despliegue` (`docs/diagramas/*.puml`); frontend (repo Flutter, `docs/diagramas/`) `componentes`, `despliegue`, `navegacion`, `secuencia-reporte-validacion` | ≥ 8 | Cumplida |
| Todos compilan | — | 9 de 9: re-render con `docker run plantuml/plantuml:1.2024.7 -tsvg -failfast2` en un directorio temporal, exit 0 y ningún SVG contiene "Syntax Error" | Todos | Cumplida |
| Enlaces en el README | — | Sección "Diagramas" del README enlaza los 5 `.puml` y sus `.svg` (los 10 archivos existen) | Enlazados | Cumplida |

## Resumen

Cumplidas: build y lint sin errores; cobertura sin BD y con BD sobre las metas; 37/37 `CodigoError` con prueba de API;
400/401/403/404/409/429/503 con `Retry-After` a nivel API; guardia contra 500 no manejados; `npm test` sin inestabilidad
(3/3); denunciados con 2 consultas por página y p95 −85 %; historial p95 −31 %; 0 % de errores en los 5 endpoints;
`npm test` −58 %; `npm run bench` disponible; 9 diagramas que compilan y están enlazados.

No cumplidas:

- **p95 < 200 ms en los 5 endpoints**: `POST /api/reportes` queda en 316,7 ms con el orden comparable (mejora de −39 %),
  por la espera en el bloqueo de karma de un único usuario y el proceso Node único (ver arriba).
- **0 flaky en la suite con BD**: 1 de 6 corridas de `test:db` falló por `EADDRINUSE` del sistema operativo al abrir una
  conexión, no por una aserción.

## Notas de comparabilidad

- **Orden del escenario `reportes`**: desde `5225230` el bench rota usuario y lugar entre peticiones consecutivas por
  defecto. La línea base enviaba 200 peticiones seguidas por usuario; ese orden se reproduce con `--reportes-un-usuario`,
  que es el usado para el antes/después. La rotación se informa aparte y etiquetada.
- **Ruido de otros contenedores**: en la línea base había dos stacks de Supabase en reposo (~25 contenedores). En esta
  medición esos stacks ya estaban detenidos (no los detuvo esta medición) y en su lugar corría el stack ajeno
  `reserva-labs` (3 contenedores, ~0,2 % de CPU en reposo). No se tocaron.
- **Emulador Android**: la línea base se tomó sin emulador. Al inicio de esta medición había uno (Pixel_9_Pro,
  `emulator-5554`); se detuvo con `adb -s emulator-5554 emu kill` antes de medir. Otro agente lo reinició por un momento
  alrededor de ese instante; se verificó con `adb devices` y la lista de procesos (`emulator`/`qemu`) antes y después de
  cada corrida de pruebas y de cada ronda de bench, y en ninguna había un emulador en ejecución, por lo que no hubo que
  descartar corridas. Se deja detenido al terminar.
- **Una sola máquina**: autocannon, la API y Postgres comparten la misma CPU, así que el generador de carga compite con
  el servidor. La variación entre rondas es visible (p. ej. `GET /api/lugares` p95 135,6 vs 208,3 ms); por eso se dan
  ambos valores. La línea base es de una sola ronda.
- **Pruebas**: la línea base de `npm test` es una corrida (la segunda); aquí la mediana de 3. Entre ambas mediciones la
  suite creció (1896 → 1970 pruebas sin BD; 2058 → 2149 con BD) y aun así es más rápida.
- **Datos**: misma siembra de bench (`--seed` antes de cada ronda) sobre la misma BD de docker; el escenario `reportes`
  borra antes los reportes de bench de menos de 31 minutos.

## Cambios principales

| Commit | Cambio |
|---|---|
| `478666b`, `80d55fe` | Siembra repetible y runner de autocannon (`npm run bench:seed`, `npm run bench`) |
| `4851693`, `fa9a857` | Diagramas PlantUML del backend y enlaces en el README |
| `356010f` | Guardia: falla toda prueba que termine en un 500 `ERROR_INTERNO` inesperado |
| `e29f212`, `7a6a997`, `b250318`, `fa624e9`, `919650f`, `ff565e0` | Brechas de API (`CONFLICTO`, 503 + `Retry-After`, `USUARIO_NO_ENCONTRADO`, 501), carreras y cobertura |
| `934fe96` | Reportes denunciados en 2 consultas en vez de 2 + 3 por ítem |
| `ad3862d` | Historial: una lectura del lugar y una agregación por petición, conteo sintético incluido |
| `d1efc19` | Migración 14: índice `ix_usuario_sintetico` (idempotente) |
| `6fd399f`, `44ddd4e`, `83e910c` | Transacción de reporte de 16 a 13 sentencias, karma al final, SQL escrito a mano en las sentencias calientes y en la lectura de `autenticar` |
| `d9de15b` | Reutiliza formateadores `Intl` por zona y una sola `KeyObject` del secreto JWT |
| `8292735` | Suite más rápida: grafo de módulos compartido por worker y presupuestos de tiempo con reloj virtual |
| `5225230`, `9dabbd8` | Bench con rotación por defecto y `--reportes-un-usuario`; documentado en el README |
| `5f54829`, `2e8e63e`, `1140d86` | Correcciones: el autor del reporte no expone el hash; la cola de revisión omite reportes eliminados; sin UPDATE vacío |
| `23a5dc2` | Elimina el handler 501 sin uso (el sobre 501 sigue probado en la app completa) |
| `b3376e7`, `f705e7a`, `a6ef301`, `410b4fd`, `2fed5c1` y otros `test(...)` | Aislamiento de pruebas, relojes virtuales y cobertura de SQL sin BD |
