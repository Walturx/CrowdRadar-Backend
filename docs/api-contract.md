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
| POST | /api/auth/register | public + limit | real | body `{ nombre, apellido, email, password, telefono?, distrito? }`; `201 { message, data: SesionResponseDTO }`; `409 EMAIL_DUPLICADO` |
| POST | /api/auth/login | public + limit | real | body `{ email, password }`; `200 { message, data: SesionResponseDTO }`; `401 CREDENCIALES_INVALIDAS`; `403 CUENTA_SUSPENDIDA`; `404 CUENTA_NO_EXISTE` only with `POLITICA_MENSAJES_AUTH=DETALLADA` |
| POST | /api/auth/recuperar | public | stub | M1 |
| GET | /api/auth/restablecer/validar | public | stub | M1, query `token` |
| POST | /api/auth/restablecer | public | stub | M1, body `{ token, nuevaPassword, confirmarPassword }` |
| GET | /recuperar/restablecer | public | stub | M1, HTML page |
| GET | /api/users/profile | auth | real | `200 { message, data: PerfilResponseDTO }` |
| PUT | /api/users/profile | auth | real | body: any non-empty subset of `{ nombre, apellido, telefono, distrito }`; `""` clears `telefono`/`distrito`; `200 { message, data: PerfilResponseDTO }`; `{}` or unknown key `400` |
| PUT | /api/users/password | auth | real | body `{ passwordActual, nuevaPassword, confirmarPassword }`; `200 { message }`; `422 PASSWORD_ACTUAL_INCORRECTA`; `422 PASSWORD_REPETIDA` |

Field limits (they match the `usuario` columns): `email` at most 120 characters, trimmed and lowercased;
`nombre`/`apellido` 2-80; `telefono` at most 20; `distrito` at most 60; `password` 8 characters minimum and 72
bytes maximum (bcrypt limit). The password strength rules (uppercase, digit) belong to M1's recovery schema.

Anti-enumeration: with the default `POLITICA_MENSAJES_AUTH=GENERICA` an unknown email and a wrong password return the
same `401` body, and a hash comparison always runs (against a decoy hash when the email is unknown). Registration
still reveals that an email exists (`409`).

`AlertaResponseDTO`: `{ "id": 12, "lugarId": 7, "lugarNombre": "Parque Kennedy", "nivelAnterior": "MODERADO", "nivelNuevo": "SATURADO",
"mensaje": "Parque Kennedy ahora está Saturado. La saturación cambió de Moderado a Saturado.", "leida": false, "fechaHora": "2026-10-05T15:00:00.000Z" }`.
`nivelAnterior` is `SIN_INFORMACION` when the place had no level before the change.

`ListadoAlertasResponseDTO` (`data` of `GET /api/alertas`): `{ items: AlertaResponseDTO[], page, size, total, totalPaginas, noLeidas }`;
`noLeidas` counts every unread alert of the caller, not only the page.

### Places and exploration (M2, M3)

| Method | Path | Access | Status | Notes |
|---|---|---|---|---|
| GET | /api/lugares | auth | stub | M2: `q`, optional bbox, `limite` |
| GET | /api/lugares/explorar | auth | stub | M3: `categoria`, `saturacion`, `lat`, `lng`, `radioKm` |
| GET | /api/lugares/categorias | auth | stub | M3 |
| GET | /api/lugares/:id | auth | stub | M2: detail with `abiertoAhora`, `saturacion`, `esFavorito` |
| GET | /api/lugares/:id/historial | auth | stub | M4 |
| GET | /api/lugares/:id/comparar | auth | stub | M4 |
| GET | /api/lugares/:id/mejor-horario | auth | stub | M4 |

### Favourites and alerts (M3)

| Method | Path | Access | Status | Notes |
|---|---|---|---|---|
| GET | /api/favoritos | auth | stub | |
| POST | /api/favoritos | auth | stub | body `{ lugarId }`; `409 FAVORITO_DUPLICADO` |
| DELETE | /api/favoritos/:lugarId | auth | stub | |
| PATCH | /api/favoritos/:lugarId/alertas | auth | stub | |
| GET | /api/alertas | auth | real | query `page`, `size` (1-50, default 20); `200 { message, data: ListadoAlertasResponseDTO }`; no alerts: message `No tienes alertas.`; `400` bad `page`/`size` |
| PATCH | /api/alertas/:id/leida | auth | real | idempotent; `200 { message, data: AlertaResponseDTO }`; `404 ALERTA_NO_ENCONTRADA` for an unknown or foreign alert; `400` when `id` is not a positive integer |
| POST | /api/dispositivos | auth | stub | body `{ token, plataforma }` |
| DELETE | /api/dispositivos/:token | auth | stub | |

### Reports, validation and reporting abuse (M4, M5)

| Method | Path | Access | Status | Notes |
|---|---|---|---|---|
| POST | /api/reportes | auth | stub | M4: body `{ lugarId, nivel }`; `422 REPORTE_EN_ESPERA` |
| GET | /api/reportes/mios | auth | stub | M4 |
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

Changing the password stamps `usuario.password_cambiada_en`: tokens issued before it answer `401 TOKEN_INVALIDO`
(`iat` has second resolution, so a token issued within the same second as the change survives); sign in again.

## Error codes

| Status | Code | Meaning |
|---|---|---|
| 400 | VALIDACION_FALLIDA | Input failed validation (`errors[]` lists the fields); also unsupported charset or encoding (415) and aborted bodies |
| 400 | JSON_INVALIDO | Malformed JSON body |
| 400 | TOKEN_RECUPERACION_INVALIDO | Recovery token unknown or used (M1) |
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
| 410 | TOKEN_RECUPERACION_EXPIRADO | Recovery token expired (M1) |
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
