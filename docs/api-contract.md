# CrowdRadar API contract (frozen by change 0)

Base path `/api`. JSON in, JSON out. This document is the contract the Flutter app and the six feature
streams (M1-M6) build against. Changing a frozen route, DTO or error code is a small contract PR reviewed by
the stream that consumes it; a new column is always a new migration.

Status column: **real** = implemented in change 0; **stub** = frozen path, method and middleware chain whose
handler answers `501 NO_IMPLEMENTADO` until the owning stream delivers it.

## Conventions

- **Frozen paths.** `/api/auth/*` and `/api/users/*` keep the Sprint 1 names because the shipped Flutter app calls them;
  the rest of the API is Spanish (`/api/lugares`, `/api/reportes`, ...). Do not rename them to match the other resources.

- Success envelope: `{ "message": string, "data": object }`. Operations with nothing to return answer `{ "message": string }`.
- Error envelope, every failure: `{ "message": string, "code": string, "errors": [{ "campo": string, "mensaje": string }] }`.
  `errors` is `[]` unless the code is `VALIDACION_FALLIDA` (one entry per failing field). A `500` also carries
  `"requestId"` (the same value as the `X-Request-Id` response header) so a report can be matched to the server log.
  Responses never contain stack traces or internal detail.
- JSON keys are camelCase Spanish; `user`, `status`, `token` and `message` keep their Sprint 1 names.
- Dates are ISO-8601 UTC; calendar days are `YYYY-MM-DD` in America/Lima.
- Pagination: query `page` (default 1) and `size` (1-50, default 20); response `data` is
  `{ items, page, size, total, totalPaginas }`.
- Authentication: `Authorization: Bearer <jwt>` (strict: exact scheme, one space). JWT HS256, 2 h, no refresh.
  Authorization decisions are made from the database row, never from token claims.
- Request bodies are validated with zod, are `strict` (unknown keys are rejected) and limited to `SERVIDOR_LIMITE_CUERPO` (100 kb by default).
- `sintetico: true` in an analytics response means some of its data comes from the demo users (email `@sintetico.crowdradar.local`); the app shows "Datos de demostración".
- Request id: `X-Request-Id` is echoed (if it matches `[A-Za-z0-9_-]{1,64}`) or generated.

### Access chains

| Chain | Middleware order |
|---|---|
| public | validar |
| public + limit | limitarIntentos (by IP) -> validar |
| auth | autenticar -> validar |
| admin | autenticar -> requerirRol(ADMIN) -> validar |

On a stub route the guards still run first: without a token an auth/admin route answers `401`, a USUARIO token on an
admin route answers `403`, and only then `501`. No frozen path ever answers `404`.

### Mount order (frozen)

1. `/lugares/explorar` and `/lugares/categorias` are declared before `/lugares/:id`.
2. The report router (`/reportes`, `/reportes/mios`, `/reportes/mios/validacion`) is mounted before the validation
   router (`/reportes/:id...`).

## Response DTOs

`UsuarioResponseDTO` (never contains the password hash):

```json
{ "id": 7, "nombre": "Ana", "apellido": "Perez", "email": "ana@crowdradar.pe", "telefono": "987654321",
  "distrito": "Miraflores", "rol": "USUARIO", "status": "ACTIVO", "puntosKarma": 0 }
```

`SesionResponseDTO` (`data` of register and login): `{ "token": "<jwt>", "expiraEn": "2026-10-05T12:00:00.000Z", "user": UsuarioResponseDTO }`.

`PerfilResponseDTO` (`data` of the profile endpoints): `{ "user": UsuarioResponseDTO }`.

## Endpoints

### System

| Method | Path | Access | Status | Notes |
|---|---|---|---|---|
| GET | / | public | real | `{ "message": "CrowdRadar API" }` |
| GET | /api/salud | public | real | `200 { message, data: { estado: "OK" } }`; `503 SERVICIO_NO_DISPONIBLE` when the database does not answer |

### Account access (M1 owns recovery)

| Method | Path | Access | Status | Notes |
|---|---|---|---|---|
| POST | /api/auth/register | public + limit | real | body `{ nombre, apellido, email, password, telefono?, distrito? }`; `201 { message, data: SesionResponseDTO }`; `409 EMAIL_DUPLICADO`; `400 VALIDACION_FALLIDA` (field `email`) for an address ending in `@sintetico.crowdradar.local`, reserved for the demo users |
| POST | /api/auth/login | public + limit | real | body `{ email, password }`; `200 { message, data: SesionResponseDTO }`; `401 CREDENCIALES_INVALIDAS`; `403 CUENTA_SUSPENDIDA`; `404 CUENTA_NO_EXISTE` only with `POLITICA_MENSAJES_AUTH=DETALLADA` |
| POST | /api/auth/recuperar | public + limit | real | body `{ email }`; `200 { message }` with the SAME neutral text whether or not the email is registered (the mail, with the link `URL_PUBLICA/recuperar/restablecer?token=...`, goes out after the answer's transaction and a mail failure does not change the answer); `400 VALIDACION_FALLIDA` for a malformed email; `404 CUENTA_NO_EXISTE` only with `POLITICA_MENSAJES_AUTH=DETALLADA`; `429 DEMASIADAS_SOLICITUDES` |
| GET | /api/auth/restablecer/validar | public + limit | real | query `token`; `200 { message }` when the token is live; `400 TOKEN_RECUPERACION_INVALIDO` (unknown or already used); `410 TOKEN_RECUPERACION_EXPIRADO` |
| POST | /api/auth/restablecer | public + limit | real | body `{ token, nuevaPassword, confirmarPassword }`; `200 { message }`; `400 TOKEN_RECUPERACION_INVALIDO`; `410 TOKEN_RECUPERACION_EXPIRADO`; `400 VALIDACION_FALLIDA` with one `errors[]` entry per unmet password requirement or a mismatched confirmation; `422 PASSWORD_REPETIDA`; `429 DEMASIADAS_SOLICITUDES` |
| GET | /recuperar/restablecer | public | real | HTML page of the emailed link (query `token`): `200` with the new-password form for a live token; `400` / `410` with the "El enlace ha caducado o no es válido" page and no form for an unknown, used or expired one. Not JSON: it is the one route outside the response envelope |
| GET | /api/users/profile | auth | real | `200 { message, data: PerfilResponseDTO }` |
| PUT | /api/users/profile | auth | real | body: any non-empty subset of `{ nombre, apellido, telefono, distrito }`; `""` clears `telefono`/`distrito`; `200 { message, data: PerfilResponseDTO }`; `{}` or unknown key `400` |
| PUT | /api/users/password | auth | real | body `{ passwordActual, nuevaPassword, confirmarPassword }`; `200 { message }`; `422 PASSWORD_ACTUAL_INCORRECTA`; `422 PASSWORD_REPETIDA` |

Field limits (they match the `usuario` columns): `email` at most 120 characters, trimmed and lowercased;
`nombre`/`apellido` 2-80; `telefono` empty or 9 digits starting with 9 (`^9\d{8}$`, empty is stored as null) on
register; `distrito` empty or 2-60.

Password policy (register, `POST /api/auth/restablecer` and `PUT /api/users/password`; one schema,
`passwordSeguraSchema`): 8 to 64 characters, at most 72 UTF-8 bytes (bcrypt reads no more; multibyte characters can
reach it first), at least one uppercase letter and one digit. Every unmet requirement is its own `errors[]` entry
(`campo`, `mensaje`), so the client can list them all. Login does not apply the policy to the password it checks.

Anti-enumeration: with the default `POLITICA_MENSAJES_AUTH=GENERICA` an unknown email and a wrong password return the
same `401` body, and a hash comparison always runs (against a decoy hash when the email is unknown). Registration
still reveals that an email exists (`409`).

`AlertaResponseDTO`: `{ "id": 12, "lugarId": 7, "lugarNombre": "Parque Kennedy", "nivelAnterior": "MODERADO", "nivelNuevo": "SATURADO",
"mensaje": "Parque Kennedy ahora está Saturado. La saturación cambió de Moderado a Saturado.", "leida": false, "fechaHora": "2026-10-05T15:00:00.000Z" }`.
`nivelAnterior` is `SIN_INFORMACION` when the place had no level before the change.

`ListadoAlertasResponseDTO` (`data` of `GET /api/alertas`): `{ items: AlertaResponseDTO[], page, size, total, totalPaginas, noLeidas }`;
`noLeidas` counts every unread alert of the caller, not only the page.

`FavoritoResponseDTO`: `{ "lugarId": 7, "nombre": "Parque Kennedy", "categoria": "PARQUE", "saturacion": "MODERADO", "alertasActivadas": true }`.

### Places and exploration (M2, M3)

| Method | Path | Access | Status | Notes |
|---|---|---|---|---|
| GET | /api/lugares | auth | real (M2) | `q`, `bbox`, `categoria`, `nivel`, `limite`; see below |
| GET | /api/lugares/explorar | auth | real (M3) | `categoria` (CategoriaLugar), `saturacion` (`TRANQUILO` | `MODERADO` | `SATURADO` | `SIN_INFORMACION`, effective level), `lat` + `lng` (both or neither), `radioKm` 0.1-20 (default `RADIO_BUSQUEDA_KM`, ignored without `lat`/`lng`), `limite` 1-`LUGARES_LIMITE_MAX`; filters combine with AND; see below |
| GET | /api/lugares/categorias | auth | real (M3) | `200 { message, data: { items: [{ categoria, etiqueta, total }] } }`, the 6 categories in enum order, `total` 0 allowed |
| GET | /api/lugares/:id | auth | real (M2) | detail with `abiertoAhora`, `saturacion`, `esFavorito`; see below |
| GET | /api/lugares/:id/historial | auth | real | M4: `desde`, `hasta` (YYYY-MM-DD, Lima), `agrupacion` = `HORA` (default; 24-hour slots `HH:00` over the range, today by default) or `DIA` (one point per day, last 7 days by default); `200 { message, data: { puntos: [{ etiqueta, valor, muestras }], hayDatos, mensaje, sintetico } }` (`valor` is the average level 1-3; with no data `hayDatos` is false and `mensaje` explains it); `400 RANGO_FECHAS_INVALIDO` when `desde` is after `hasta` or they are more than 31 days apart (`desde` equal to `hasta` is one day); `404 LUGAR_NO_ENCONTRADO` |
| GET | /api/lugares/:id/comparar | auth | real | M4: `desdeA`, `hastaA`, `desdeB`, `hastaB` required, `diasA`, `diasB` = `TODOS` (default) \| `LABORABLES` \| `FIN_DE_SEMANA`; `200 { message, data: { periodoA, periodoB: [24 x { hora, valor, muestras }], diferencias: [{ hora, diferencia }] (B minus A, hours with data in both), resumen, suficiente, mensaje, sintetico } }`; `suficiente` is false (and `diferencias` empty) when either period has fewer than `ANALITICA_MIN_MUESTRAS` samples; `400 RANGO_FECHAS_INVALIDO` when either period has `desde` not before `hasta` (a comparison needs at least two days, unlike the history) or more than 31 days apart; `404 LUGAR_NO_ENCONTRADO` |
| GET | /api/lugares/:id/mejor-horario | auth | real | M4: `dias` (default `TODOS`), `semanas` 1-12 (default 4, counted back from today); `200 { message, data: { recomendaciones: [{ horaInicio, horaFin, nivel, promedio, muestras }] (up to 3, calmest first, inside the opening hours), suficiente, mensaje, sintetico } }`; `400 VALIDACION_FALLIDA`; `404 LUGAR_NO_ENCONTRADO` |

`GET /api/lugares` query (at least one of `q` and `bbox`; the rest is optional and combines with AND; no pagination):

| Param | Rule |
|---|---|
| `q` | `LUGARES_Q_MIN`-`LUGARES_Q_MAX` characters once trimmed (2-60 by default); accent- and case-insensitive substring of `nombre` (`%` and `_` are literal) |
| `bbox` | `minLng,minLat,maxLng,maxLat` in decimal degrees: 4 numbers, lat -90..90, lng -180..180, min < max; edges are inclusive. A box that crosses the antimeridian (min > max) is not supported and is rejected |
| `categoria` | `PARQUE`, `CENTRO_COMERCIAL`, `MERCADO`, `TRANSPORTE`, `PLAZA`, `PLAYA` |
| `nivel` | `TRANQUILO`, `MODERADO`, `SATURADO`, `SIN_INFORMACION` (effective level, see below) |
| `limite` | 1-`LUGARES_LIMITE_MAX`, `LUGARES_LIMITE_DEFAULT` when absent (200 and 200 by default) |

`200` `data`: `{ "items": LugarResumenResponseDTO[] }` ordered by `nombre` (accents and case ignored; then byte order, so spaces and punctuation come before digits, and digits before letters). An empty list is still `200`
with `items: []` and the explanation in the envelope `message` (`No hay lugares en esta zona.` or
`No encontramos lugares para “{q}”. Prueba con otro nombre.`); otherwise `message` is `Lugares obtenidos correctamente.`.
Invalid input is `400 VALIDACION_FALLIDA` with one `errors[{ campo }]` per failing field (`q`, `bbox`, `categoria`, `nivel`,
`limite`); neither `q` nor `bbox` reports `campo: "bbox"`. `GET /api/lugares/:id`: `400` when `id` is not a positive integer,
`404 LUGAR_NO_ENCONTRADO` ("No se pudo obtener la información del lugar.") when it does not exist.

Effective level: the stored `saturacion_actual` while its reading is not older than `SATURACION_VENTANA_MIN`; `SIN_INFORMACION`
when there is none or it is stale. M2 never computes it (M4 writes it). `reportesRecientes` counts the reports of the same window.

`esFavorito` / `alertasActivadas` come from M3's `FavoritoDAO` and `saturacion.reportesRecientes` from M4's `ReporteDAO`: since the
MVP integration `ensamblar` hands the one `FavoritoDAO` of the favourites stream and the shared `ReporteDAO` to the places builder.

`LugarResumenResponseDTO`: `{ "id": 3, "nombre": "Parque John F. Kennedy", "categoria": "PARQUE", "latitud": -12.121791,
"longitud": -77.030453, "saturacion": "MODERADO" }` (`saturacion` is the effective level as a string).

`LugarDetalleResponseDTO` (`data` of `GET /api/lugares/:id`; `saturacion` is an object here):

```json
{ "id": 3, "nombre": "Parque John F. Kennedy", "direccion": "Miraflores, Lima", "categoria": "PARQUE",
  "latitud": -12.121791, "longitud": -77.030453, "horarioAtencion": null, "abiertoAhora": null, "urlFoto": null,
  "saturacion": { "nivel": "MODERADO", "actualizadoEn": "2026-10-05T14:55:00.000Z", "reportesRecientes": 3, "mensaje": null },
  "esFavorito": false, "alertasActivadas": false }
```

`abiertoAhora` is `null` when the opening hours are unknown. For `SIN_INFORMACION`, `actualizadoEn` is `null` and `mensaje` is
`Aún no hay reportes suficientes para determinar la saturación de este lugar.`.

`GET /api/lugares/explorar` (M3): the same `items` as the list plus `distanciaMetros` (integer metres from `lat`/`lng`; `null` without them).
Without `lat`/`lng` the items come ordered by `nombre`; with them, nearest first and only places within `radioKm` (inclusive).
`lat` -90..90 and `lng` -180..180, sent together: one alone is `400 VALIDACION_FALLIDA` naming the missing one. `saturacion` is the
effective level (a reading older than `SATURACION_VENTANA_MIN` counts as `SIN_INFORMACION`). Invalid `categoria`, `saturacion`, `lat`,
`lng`, `radioKm` or `limite` is `400` with `errors[{ campo }]`. An empty result is `200` with `items: []` and, as `message`:
only `categoria` `No hay lugares cercanos disponibles para esa categoría.`; only `saturacion` `No hay lugares cercanos con ese nivel de saturación.`;
anything else `No hay lugares cercanos que cumplan con los filtros seleccionados.`; otherwise `Lugares obtenidos correctamente.`.
`GET /api/lugares/categorias` message: `Categorías obtenidas correctamente.`; labels: Parques, Centros comerciales, Mercados, Transporte, Plazas, Playas.

### Favourites and alerts (M3)

| Method | Path | Access | Status | Notes |
|---|---|---|---|---|
| GET | /api/favoritos | auth | real | `200 { message, data: { items: [FavoritoResponseDTO] } }`, caller only, newest first; `saturacion` is the effective level (stale or null = `SIN_INFORMACION`); none: message `No tienes lugares favoritos registrados.` |
| POST | /api/favoritos | auth | real | body `{ lugarId }` (positive integer), strict; `201 { message: "Añadido a favoritos", data: FavoritoResponseDTO }` with `alertasActivadas` true; `404 LUGAR_NO_ENCONTRADO`; `409 FAVORITO_DUPLICADO` ("Este lugar ya pertenece a tus favoritos.", also under concurrency); `400` bad body |
| DELETE | /api/favoritos/:lugarId | auth | real | `204` without body (the alerts of that favourite go with it); `404 FAVORITO_NO_ENCONTRADO` when it is not the caller's favourite (a foreign one looks the same); `400` when `lugarId` is not a positive integer |
| PATCH | /api/favoritos/:lugarId/alertas | auth | real | body `{ alertasActivadas: boolean }`, strict; idempotent; `200 { message, data: FavoritoResponseDTO }`; `404 FAVORITO_NO_ENCONTRADO`; `400` bad body or `lugarId` |
| GET | /api/alertas | auth | real | query `page`, `size` (1-50, default 20); `200 { message, data: ListadoAlertasResponseDTO }`; no alerts: message `No tienes alertas.`; `400` bad `page`/`size` |
| PATCH | /api/alertas/:id/leida | auth | real | idempotent; `200 { message, data: AlertaResponseDTO }`; `404 ALERTA_NO_ENCONTRADA` for an unknown or foreign alert; `400` when `id` is not a positive integer |
| POST | /api/dispositivos | auth | real | body `{ token (1-255), plataforma: ANDROID or IOS }`, strict; `201` new token, `200` known token (upsert: a token held by another user moves to the caller, who becomes its only owner); `400` bad body |
| DELETE | /api/dispositivos/:token | auth | real | token URL-encoded; `204` always (idempotent): a token that is not the caller's is left untouched and its existence is not revealed; `400` token longer than 255 |

### Reports, validation and reporting abuse (M4, M5)

| Method | Path | Access | Status | Notes |
|---|---|---|---|---|
| POST | /api/reportes | auth | real | M4: body `{ lugarId, nivel }` (`nivel`: `TRANQUILO` \| `MODERADO` \| `SATURADO`); `201 { message, data: { reporte: { id, lugarId, nivel, fechaHora }, karma: { puntosGanados, total, motivoSinPuntos }, saturacionLugar: { nivel, actualizadoEn } } }` (`motivoSinPuntos`: `TOPE_DIARIO` or null; `saturacionLugar.nivel` null while there is not enough information); `400 VALIDACION_FALLIDA`; `404 LUGAR_NO_ENCONTRADO`; `422 REPORTE_EN_ESPERA` ("Ya reportaste este lugar. Vuelve a intentarlo en N minutos.") |
| GET | /api/reportes/mios | auth | real | M4: `page`, `size`; `200 { message, data: { items: [{ id, lugar: { id, nombre }, nivel, fechaHora, estado, puntosOtorgados, motivoSinPuntos }], page, size, total, totalPaginas } }`, newest first, own reports only; with no reports `message` is "Aún no tienes reportes" and `items` is `[]`; `400` when `page` < 1 or `size` outside 1-50 |
| GET | /api/reportes/mios/validacion | auth | stub | M5 |
| GET | /api/validaciones/pendientes | auth | stub | M5: `lat`, `lng`, `radioKm`, `horas`, `page`, `size` |
| GET | /api/reportes/:id | auth | stub | M5 |
| GET | /api/reportes/:id/confiabilidad | auth | stub | M5 |
| POST | /api/reportes/:id/validaciones | auth | stub | M5: body `{ tipoAccion }`; `422 AUTOVALIDACION_NO_PERMITIDA`; `409 VALIDACION_DUPLICADA` |
| POST | /api/reportes/:id/denuncias | auth | stub | M5: body `{ motivo, detalle }`; `422 AUTODENUNCIA_NO_PERMITIDA`; `409 DENUNCIA_DUPLICADA` |

### Moderation (M6, admin)

| Method | Path | Access | Status | Notes |
|---|---|---|---|---|
| GET | /api/admin/reportes-denunciados | admin | stub | |
| GET | /api/admin/reportes-denunciados/:reporteId | admin | stub | |
| POST | /api/admin/reportes-denunciados/:reporteId/resolucion | admin | stub | `409 SIN_DENUNCIAS_PENDIENTES` |
| GET | /api/admin/usuarios | admin | stub | `q`, `status`, `orden`, `page`, `size` |
| GET | /api/admin/usuarios/:id | admin | stub | |
| POST | /api/admin/usuarios/:id/suspension | admin | stub | body `{ dias, motivo }` with `dias` one of 3, 7 or 30 |
| POST | /api/admin/usuarios/:id/reactivacion | admin | stub | `409 USUARIO_NO_SUSPENDIDO` |

## Rate limits

`POST /api/auth/login`, `POST /api/auth/register` and `PUT /api/users/password` are limited per client IP, counting
EVERY attempt (successful or not): `LIMITE_LOGIN`, `LIMITE_REGISTRO` and `LIMITE_PASSWORD` per `LIMITE_VENTANA_MIN`
minutes. Exceeding a limit answers `429 DEMASIADAS_SOLICITUDES`. On top of that, `POST /api/auth/login` counts FAILED
attempts per email (case-insensitive, any IP): after `LIMITE_LOGIN` failures the account is locked for the rest of the
window and every login for that email, even with the right password, answers `429 DEMASIADOS_INTENTOS`.
Every 429 and every 503 carries a `Retry-After` header (seconds). Behind a reverse proxy set `TRUST_PROXY` to the number
of proxy hops, otherwise every client shares the proxy's address.

`POST /api/auth/recuperar` (`LIMITE_RECUPERAR`, 5) and `POST /api/auth/restablecer` plus its `validar` check
(`LIMITE_RESTABLECER`, 10) are limited per client IP the same way.

Recovery token: 32 random bytes (base64url), only its SHA-256 is stored, single use, valid `RECUPERACION_EXPIRA_MIN`
minutes. A new request, or a successful reset, invalidates every other live token of the user. After a reset the user's
earlier JWTs are rejected. The token never appears in logs (request URLs are logged with its value redacted).

Changing the password stamps `usuario.password_cambiada_en`: tokens issued before it answer `401 TOKEN_INVALIDO`
(`iat` has second resolution, so a token issued within the same second as the change survives); sign in again.

## Error codes

| Status | Code | Meaning |
|---|---|---|
| 400 | VALIDACION_FALLIDA | Input failed validation (`errors[]` lists the fields); also unsupported charset or encoding (415) and aborted bodies |
| 400 | JSON_INVALIDO | Malformed JSON body |
| 400 | TOKEN_RECUPERACION_INVALIDO | Recovery token unknown or already used |
| 400 | RANGO_FECHAS_INVALIDO | Invalid date range (M4) |
| 401 | NO_AUTENTICADO | Missing or non-Bearer Authorization header |
| 401 | TOKEN_INVALIDO | Expired, malformed or badly signed token, the user no longer exists, or the token predates the last password change |
| 401 | CREDENCIALES_INVALIDAS | Wrong email or password |
| 403 | CUENTA_SUSPENDIDA | The account is suspended (the app signs the user out) |
| 403 | ACCESO_DENEGADO | The role is not allowed on this route |
| 404 | RUTA_NO_ENCONTRADA | Path not in the contract |
| 404 | CUENTA_NO_EXISTE | Unknown email (only with `POLITICA_MENSAJES_AUTH=DETALLADA`) |
| 404 | USUARIO_NO_ENCONTRADO | User id not found |
| 404 | LUGAR_NO_ENCONTRADO | Place not found |
| 404 | REPORTE_NO_ENCONTRADO | Report not found |
| 404 | FAVORITO_NO_ENCONTRADO | Favourite not found |
| 404 | ALERTA_NO_ENCONTRADA | Alert not found |
| 409 | EMAIL_DUPLICADO | Email already registered |
| 409 | FAVORITO_DUPLICADO | Place already a favourite |
| 409 | VALIDACION_DUPLICADA | Report already validated by this user |
| 409 | DENUNCIA_DUPLICADA | Report already reported by this user |
| 409 | USUARIO_YA_SUSPENDIDO | User already suspended |
| 409 | USUARIO_NO_SUSPENDIDO | User is not suspended |
| 409 | SIN_DENUNCIAS_PENDIENTES | Nothing to resolve |
| 409 | CONFLICTO | Generic unique-constraint conflict |
| 410 | TOKEN_RECUPERACION_EXPIRADO | Recovery token expired |
| 422 | REPORTE_EN_ESPERA | Cooldown between reports for the same place |
| 422 | AUTOVALIDACION_NO_PERMITIDA | Cannot validate your own report |
| 422 | AUTODENUNCIA_NO_PERMITIDA | Cannot report your own report |
| 422 | PASSWORD_ACTUAL_INCORRECTA | Current password does not match |
| 422 | PASSWORD_REPETIDA | New password equals the current one |
| 422 | OPERACION_NO_PERMITIDA | Business rule violation without a more specific code |
| 429 | DEMASIADAS_SOLICITUDES | Rate limit exceeded (`Retry-After`) |
| 429 | DEMASIADOS_INTENTOS | Too many failed logins for this email; account locked until the window ends (`Retry-After`) |
| 500 | ERROR_INTERNO | Unexpected failure (body carries `requestId`, no detail) |
| 501 | NO_IMPLEMENTADO | Frozen route not delivered yet |
| 503 | APAGANDO | The process is shutting down; `GET /api/salud` answers it so the balancer drains traffic (`Retry-After`) |
| 503 | SERVICIO_NO_DISPONIBLE | The database is unreachable, the pool is exhausted or a query hit `statement_timeout` (`Retry-After`) |
