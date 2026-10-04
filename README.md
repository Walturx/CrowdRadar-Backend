# CrowdRadar Backend

REST API for CrowdRadar: real-time crowding reports for places in Lima. Express 5, Sequelize 6, PostgreSQL 16,
TypeScript (strict). The API contract is frozen in [`docs/api-contract.md`](docs/api-contract.md).

## Prerequisites

- Node 22 or newer
- PostgreSQL 16 (or Docker: `docker compose up -d postgres`)

## Quick start

```bash
cp .env.example .env     # then replace the three CAMBIAR_* placeholders (see Environment variables)
npm ci
docker compose up -d postgres
npm run db:migrate
npm run db:seed          # admin user + Lima places
npm run dev
```

The API refuses to start with the placeholder secrets from `.env.example` (and `npm run db:seed` refuses to run with
the placeholder `ADMIN_PASSWORD`), so a copied example never boots with a known secret.

## Run

| How | Command |
|---|---|
| Day to day (reload) | `npm run dev` |
| Compiled | `npm run build && npm start` |
| Everything in containers | `docker compose up --build` (a one-shot `migrate` service applies the migrations, then `api` starts; `GET /api/salud` answers 200) |

`docker compose` needs `DB_PASSWORD` (it has no default) and publishes PostgreSQL on `127.0.0.1` only.
The API shuts down gracefully on `SIGTERM`/`SIGINT` (stops accepting connections, finishes in-flight requests,
closes the pool) and retries the database connection at boot (`DB_REINTENTOS`, exponential backoff) before exiting with 1.
From the first signal `GET /api/salud` answers `503 APAGANDO`, so a load balancer drains the instance; a second signal
forces an immediate exit with 1. `APAGADO_TIMEOUT_MS` (35 s) must exceed `SERVIDOR_REQUEST_TIMEOUT_MS` (30 s) and the
compose `stop_grace_period` (40 s) must exceed `APAGADO_TIMEOUT_MS`, or the orchestrator kills in-flight requests.
`GET /api/salud` probes the database with its own 2 s limit, so a saturated pool answers 503 instead of hanging.

### Migrations in containers

Migrations are never run by the API container. `docker compose` has a **one-shot** `migrate` service
(`npm run db:migrate`, `restart: "no"`, after Postgres is healthy); `api` waits for it with
`depends_on: migrate: condition: service_completed_successfully` and its command only starts the server. In any other
orchestrator run the same image once per release as a job or init step (`npm run db:migrate`) before rolling out the
new version. **`api` replicas must not run migrations**: parallel runs race on `SequelizeMeta` and on DDL locks.
`sequelize-cli` stays in the production dependencies because the migrate job runs from the same image.

## Migrate

Schema changes only happen through sequelize-cli migrations (`database/migrations/*.cjs`); the API never calls
`sequelize.sync()`. Migrations 01-10 are frozen: a new column is a new migration.

| Script | Purpose |
|---|---|
| `npm run db:migrate` | Apply pending migrations (re-running is a no-op) |
| `npm run db:migrate:undo` | Undo the last migration |
| `npm run db:migrate:undo:all` | Undo all of them |
| `npm run db:seed` | Seed the admin user (`ADMIN_EMAIL`/`ADMIN_PASSWORD`), the Lima places (`database/data/lugares-lima.json`, OpenStreetMap, ODbL) and, unless disabled, the synthetic demo history (see Datos de demostración); idempotent |
| `npm run db:reset` | Undo all, migrate, seed |

Seeder notes: seeders run through sequelize-cli and read `process.env` directly (the API's zod schema does not apply),
so the admin seeder repeats the password rules. Undoing the admin seeder fails with a foreign-key error if that admin
already authored sanctions (`sancion_usuario.administrador_id` is `ON DELETE RESTRICT` on purpose).

Place data comes from OpenStreetMap (ODbL). The app must show "© OpenStreetMap contributors" wherever it displays that
data (the map and the place detail); this is tracked for the About screen of M1.

Migration 13 (`lugar.osm_tipo`) gives the six places seeded by change 0 their real type (`3570374` is a relation, `28993402`,
`44364378` and `396258998` are ways); the Lima seeder also fixes a legacy row that still carries the default `node` instead of
inserting a duplicate, and runs in one transaction.

### Undoing migration 13

`npm run db:migrate:undo` restores the old unique key on `osm_id` alone, so it **fails, naming every `osm_id` that exists with
several types** (for example `osm_id 777 (node, way)`), when two places share a number. Nothing is changed in that case.
Decide which row of each pair to keep (the one with favourites and reports, if any), move or delete the other (reports use
`ON DELETE RESTRICT`: re-point `reporte_saturacion.lugar_id` first), then run the undo again. Take the backup of the rollback
runbook first.

### Datos de demostración

`db:seed` also loads a **synthetic** history so the analytics screens (history, comparison, best time) have something
to show: three fake users (`Demo 01` to `Demo 03`, emails `demoNN@sintetico.crowdradar.local`, no password, they cannot log
in) and about four weeks of crowd reports in each of the 45 places, with realistic hour patterns per category (beaches
full on weekend middays, transport at rush hours, markets in the morning, malls on weekend afternoons). **This data is
not real**: the analytics endpoints answer `sintetico: true` whenever it is part of the result and the app labels it
"Datos de demostración". The seeder is deterministic (the same day of the same place always gets the same reports), idempotent
(running it again adds nothing, or only the days since the last run) and never touches real users or reports.

- **Disable it**: set `SEED_SINTETICO=false` before `npm run db:seed` (the seeder then logs that it was skipped). When the
  variable is not set the history is loaded outside production (`NODE_ENV` other than `production`) and skipped in production.
  Leave it unset (`.env.example` ships it commented out): `SEED_SINTETICO=true` with `NODE_ENV=production` is rejected, by the
  API at startup and by the seeder.
- **Remove it**: `npx sequelize-cli db:seed:undo --seed 20261005100003-historial-sintetico.cjs` deletes the synthetic users, their
  reports and whatever else points at those users (favourites, alerts, devices, votes) and nothing else.
- **Reserved domain**: nobody can sign up with an email ending in `@sintetico.crowdradar.local` (`400 VALIDACION_FALLIDA`), so a
  real account is never mistaken for demo data.

## Test

| Script | Purpose |
|---|---|
| `npm test` | Vitest, no database and no network |
| `npm run test:cov` | Same with a coverage report (`coverage/`) |
| `npm run test:db` | The whole suite **including** the database-backed tests; fails immediately when `DATABASE_URL_TEST` is not set |
| `npm run lint` | `tsc --noEmit` and ESLint |
| `npm run build` | Compile to `dist/` (`tsc -p tsconfig.build.json`) |

Database-backed tests (migrations contract, DAO contract, real-server characterization) are opt-in: `npm test` skips
them unless `DATABASE_URL_TEST` points to a throwaway PostgreSQL, for example
`postgres://crowdradar:<password>@localhost:5432/crowdradar_test`. The tests create and drop temporary databases next
to it. Use `npm run test:db` in CI so those tests can never be skipped silently. `.only` is forbidden
(`allowOnly: false`).

CI (`.github/workflows/ci.yml`) runs `lint`, `build` and `npm test`, then `npm run test:db` against a Postgres 16
service; each job has a `timeout-minutes` limit, and `test:db` reruns the whole suite on purpose (the database cases
share files with database-free ones, so no file list has to be kept in sync). Which interfaces each stream (M1 to M6) implements, and which files it owns, is in `docs/contratos-streams.md`.

Tests follow strict TDD (red, green, refactor). `test/support` holds the in-memory DAOs, fakes and
`crearContenedorPrueba`, which assembles the real composition root with fakes instead of a database. The in-memory
DAOs return copies, use the injected `Reloj`, and enforce foreign keys when given a `crearSembradorMemoria()` registry.
To run a DAO contract against a Sequelize implementation use `ejecutarContratoDAO` (`test/dao/`) and the template
`test/dao/plantilla.sequelize.contract.test.ts.md`.

Mappers own the DTO <-> entity translation; services take and return domain types, so streams must not duplicate
service request shapes in `dto/` (it only holds the HTTP request and response shapes).

## Project layout

```
src/
  server.ts            process entry: config, retry, http.Server, graceful shutdown
  app.ts               createApp(container): helmet, cors, json, request log, routers, 404, error middleware
  config/              ConfiguracionApp (Singleton) and the zod environment schema
  container/           composition root: one builder per stream + index.ts (ensamblar, crearContenedor)
  route/               routers and the frozen mount contract; stubs answer 501 until a stream delivers
  middleware/          autenticar, requerirRol, validar, limitarIntentos, registroPeticiones, rutaNoEncontrada, manejarErrores
  controller/          HTTP adapters: call a service, wrap the result in a response envelope
  service/             use-case interfaces; impl/ holds the implementations
  facade/              (later) Recuperacion, Reporte, Moderacion facades
  dao/                 DAO interfaces and Paginacion (page types and helpers); impl/sequelize/ holds Sequelize DAOs and models
  entity/              domain entities (plain TypeScript, no ORM)
  dto/                 request schemas (zod) and response shapes
  mapper/              entity -> response DTO
  adapter/             ports and adapters: seguridad (Hasher, EmisorToken); later correo and push
  pattern/             (later) strategy and observer
  exception/           AppException, CodigoError, http/ (one class per HTTP status), usuario/ (module exceptions)
  datasource/          ConexionBD port, ConexionFactory (Factory Method), impl/ (PostgreSQL + Sequelize)
  enum/                domain enumerations as const objects
  types/               ambient Express typings (req.usuario)
  util/                logger, Reloj, EstadoServicio, reintentar, servidorHttp
database/              sequelize-cli: config.cjs, migrations/, seeders/, data/
test/                  mirrors src/; support/ holds fakes and builders
docs/api-contract.md   the frozen API contract
```

Layer folders are singular and one type lives in one PascalCase file.

### File naming

| What | Rule | Examples |
|---|---|---|
| A class, interface or type that is the module's main export | PascalCase file named after it | `UsuarioDAO.ts`, `AuthServiceImpl.ts`, `Contenedor.ts` |
| Concrete adapters (`adapter/**/impl/`) | PascalCase ending in `Adapter`; the port keeps the plain name | port `Hasher.ts`, adapter `BcryptHasherAdapter.ts` |
| Functions and middleware | camelCase, singular | `autenticar.ts`, `limitarIntentos.ts`, `reintentar.ts` |
| Routers | `*.routes.ts` (`<resource>.routes.ts`), lowercase; helpers `middlewareRuta.ts`, `stub.ts` | `usuario.routes.ts` |
| Composition root | `container/<stream>.ts`, lowercase, one per stream, plus `Contenedor.ts` | `container/reporte.ts` |
| Tests | mirror `src/` and carry the kind before `.test.ts`: `.unit` (no I/O), `.api` (HTTP through supertest or a spawned server), `.contract` (shared DAO contract, real PostgreSQL migrations); `.whitebox` / `.blackbox` (the per-stream evidence tests of the test design: branch coverage of one method, equivalence/boundary tables over one endpoint) | `autenticar.unit.test.ts`, `auth.usuario.api.test.ts`, `UsuarioDAOMemoria.contract.test.ts` |

`test/ops/convenciones.unit.test.ts` enforces the test suffix, the `Adapter` suffix and the route and container names.
`Paginacion` (types plus `armarPagina` and `desplazamiento`) lives in one module, `dao/Paginacion.ts`, because the page
shape is part of the DAO contract.
 `datasource/`, `enum/` and `types/` are the
three folders that do not map to one request-chain layer: `datasource/` is the connection port plus its Factory Method
(infrastructure), `enum/` holds the shared domain vocabulary (const objects, no logic) and `types/` only extends
Express's `Request`. They are intentional and listed in the design tree.

## Layering rule

The request chain is **route -> middleware -> controller -> [facade] -> service -> dao (interface) -> dao/impl/sequelize**.

1. A controller imports only facade/service interfaces, DTOs and Express types: never a DAO, `sequelize` or an entity.
2. Services and facades import interfaces, never `impl/` (the composition root `container/` is the only exception).
3. `sequelize` is imported only by `datasource/impl`, `dao/impl/sequelize` and the composition root that instantiates them.
4. `ConfiguracionApp.getInstance()` is called only by `server.ts`; everything else receives the configuration injected.
5. What leaves over HTTP is always a response DTO produced by a Mapper, inside the `{message, data}` envelope.
6. Failures are `AppException` subclasses; only `manejarErrores` decides the HTTP status, per class.
7. Controllers have no `try/catch`: Express 5 forwards rejected promises to the error middleware.

Quick checks: `rg "from '.*(dao/impl|sequelize|entity)" src/controller` finds nothing; `rg "sequelize\.sync\(" src database`
finds nothing; `rg "console\.log" src` finds nothing.

## Pattern map

| Pattern | Where |
|---|---|
| Singleton | `config/ConfiguracionApp`: immutable, validated once, fail-fast |
| Factory Method | `datasource/ConexionFactory.conectar()` -> `ConexionPostgresFactory.crearConexion()` |
| DAO | `dao/*DAO` ports with `dao/impl/sequelize/*DAOSequelize` and in-memory fakes in `test/support/dao/memoria` |
| Adapter | `adapter/seguridad` (`BcryptHasherAdapter`, `JwtEmisorTokenAdapter`), `datasource/impl/ConexionSequelize`; correo and push to come |
| Mapper | `mapper/UsuarioMapper` (entity -> response DTO) |
| Service Layer | `service/*Service` interfaces with `service/impl/*Impl`; controllers never touch DAOs |
| Facade | placeholders for `RecuperacionFacade`, `ReporteFacade`, `ModeracionFacade` (streams M1, M4, M6) |
| Strategy / Observer | placeholders for saturation and reliability strategies and the saturation observer (M4, M5, M3) |
| composition root | `container/`: manual DI; each stream edits only its own builder; `crearContenedorPrueba` reuses it with fakes |

## Alertas y push

When the saturation level of a place changes, `AlertaFavoritosObserver` (subscribed to the shared `PublicadorSaturacion`
in `container/favoritoAlerta.ts`) alerts every user that follows the place with alerts on, except the author of the report:

1. the in-app alert is stored first (`GET /api/alertas`, `PATCH /api/alertas/:id/leida`); it is the guaranteed channel;
2. then a push is sent to that user's devices (`POST /api/dispositivos`, `DELETE /api/dispositivos/:token`).

A failing push provider, or a failure with one recipient, is logged and never blocks the others nor the report request.
A device token belongs to one user: registering a token another user holds moves it to the caller.

**Console adapter (default).** `PUSH_PROVEEDOR=consola` (or unset) uses `ConsolaNotificadorAdapter`: it logs the payload and
the recipient count (never the tokens) and needs no Firebase, so the whole alert flow runs locally and in CI.

**Enabling FCM later.** `PUSH_PROVEEDOR=fcm` plus `FCM_CREDENCIALES_RUTA=<service-account.json>` selects
`FcmNotificadorAdapter`; the process refuses to start without the credentials path. The adapter is a skeleton: until a
Firebase client (`ClienteFcm`, a thin wrapper of `firebase-admin` `sendEachForMulticast`) is wired in
`crearNotificadorPush`, `enviar` throws `NoImplementadoException`, which the observer logs while the in-app alert stays.
To finish it: add `firebase-admin`, implement `ClienteFcm` (load the package lazily so the console mode never needs it) and
pass it to the adapter. Tokens answered with `registration-token-not-registered` or `invalid-registration-token` are
returned as `tokensInvalidos` and deleted.

## Environment variables

All configuration comes from the environment, validated at startup with zod (`src/config/esquemaEntorno.ts`). An invalid
or missing value prints every offending key (never its value) and exits with code 1 before the server listens.
`.env.example` lists every key. Defaults in parentheses.

| Variable | Meaning |
|---|---|
| `NODE_ENV` | `development`, `test` or `production` (development) |
| `PUERTO` | Port the API listens on (3000) |
| `URL_PUBLICA` | Public base URL, used in links (http://localhost:3000) |
| `CORS_ORIGENES` | Comma separated allowed origins; others get no CORS headers (http://localhost:3000) |
| `LOG_NIVEL` | pino level: fatal, error, warn, info, debug, trace, silent (info) |
| `ZONA_HORARIA` | IANA time zone for aggregations and opening hours (America/Lima); an unknown name stops the boot |
| `SERVIDOR_LIMITE_CUERPO` | Maximum JSON body, integer plus `b`, `kb` or `mb` (100kb) |
| `TRUST_PROXY` | Proxy hops trusted for the client IP: `false`, a number, or a name such as `loopback`; `true` is too permissive (false) |
| `SERVIDOR_REQUEST_TIMEOUT_MS` | Time to receive a whole request (30000) |
| `SERVIDOR_HEADERS_TIMEOUT_MS` | Time to receive the headers; must exceed the keep-alive timeout (66000) |
| `SERVIDOR_KEEPALIVE_TIMEOUT_MS` | Idle keep-alive time; keep it above the load balancer idle timeout (65000) |
| `APAGADO_TIMEOUT_MS` | Hard limit of the graceful shutdown; must exceed `SERVIDOR_REQUEST_TIMEOUT_MS` (35000) |
| `DB_HOST` | Database host (localhost) |
| `DB_PUERTO` | Database port (5432) |
| `DB_NOMBRE` | Database name (crowdradar) |
| `DB_USUARIO` | Database user (crowdradar) |
| `DB_PASSWORD` | **Required**, no default; not a `CAMBIAR*` placeholder |
| `DB_SSL` | TLS to the database; the certificate is verified (use `NODE_EXTRA_CA_CERTS` for a private CA) (false) |
| `DB_POOL_MAX` | Connection pool maximum (10) |
| `DB_POOL_MIN` | Connection pool minimum, not above the maximum (0) |
| `DB_POOL_ACQUIRE_MS` | Max wait for a pooled connection (30000) |
| `DB_POOL_IDLE_MS` | Idle time before a pooled connection is released (10000) |
| `DB_STATEMENT_TIMEOUT_MS` | Server-side statement timeout (15000) |
| `DB_LOCK_TIMEOUT_MS` | Server-side lock timeout per connection; a statement waiting longer fails and the request answers 503 with `Retry-After` (5000) |
| `DB_REINTENTOS` | Boot attempts to reach the database before exiting (5) |
| `DB_REINTENTO_ESPERA_MS` | First backoff wait, doubling each attempt (500) |
| `JWT_SECRETO` | **Required**, at least 32 characters, not a `CAMBIAR*` placeholder |
| `JWT_EXPIRA_EN` | Token lifetime with a unit s, m, h or d (2h) |
| `BCRYPT_COSTO` | bcrypt cost, 4-15 (10) |
| `POLITICA_MENSAJES_AUTH` | `GENERICA` (identical answer for unknown email and wrong password) or `DETALLADA` (GENERICA) |
| `LIMITE_VENTANA_MIN` | Rate-limit window in minutes (15) |
| `LIMITE_LOGIN` | Logins per window and IP, successful or not (10); also the failed logins per email before the account locks (10) |
| `LIMITE_REGISTRO` | Registrations per window and IP (10) |
| `LIMITE_RECUPERAR` | Recovery requests per window (5), wired when M1 delivers the route |
| `LIMITE_RESTABLECER` | Reset attempts per window (10), wired when M1 delivers the route |
| `LIMITE_PASSWORD` | Password changes per window and IP, successful or not (5) |
| `RECUPERACION_EXPIRA_MIN` | Recovery token lifetime in minutes (30) |
| `COOLDOWN_REPORTE_MIN` | Minutes between reports of one user for one place (30) |
| `KARMA_POR_REPORTE` | Karma for a report (10) |
| `KARMA_POR_VALIDACION` | Karma for a validation (2) |
| `KARMA_REPORTES_PREMIADOS_DIA` | Rewarded reports per day (5) |
| `SATURACION_ESTRATEGIA` | `PONDERADA` or `ULTIMO_REPORTE` (PONDERADA) |
| `SATURACION_VENTANA_MIN` | Report window for saturation in minutes (60) |
| `SATURACION_MIN_REPORTES` | Minimum reports to compute saturation (3) |
| `SATURACION_UMBRAL_MODERADO` | Weighted average threshold for MODERADO (1.67) |
| `SATURACION_UMBRAL_SATURADO` | Weighted average threshold for SATURADO (2.34) |
| `CONFIABILIDAD_ESTRATEGIA` | `PONDERADA_KARMA` or `SIMPLE` (PONDERADA_KARMA) |
| `CONFIABILIDAD_MIN_VOTOS` | Minimum votes for a reliability level (3) |
| `CONFIABILIDAD_UMBRAL_ALTA` | Percentage for ALTA (70) |
| `CONFIABILIDAD_UMBRAL_MEDIA` | Percentage for MEDIA (40) |
| `TOPE_KARMA_PESO` | Karma cap when weighting votes (500) |
| `RADIO_BUSQUEDA_KM` | Default exploration radius in km (2) |
| `RADIO_PENDIENTES_KM` | Radius for reports pending validation in km (5) |
| `VENTANA_PENDIENTES_HORAS` | Window for pending reports in hours, 1-24 (3) |
| `ANALITICA_MIN_MUESTRAS` | Minimum samples per time slot (5) |
| `EVENTOS_PRESUPUESTO_MS` | After a report commit the answer waits at most this long for the event subscribers; the delivery goes on in the background (500) |
| `ALERTAS_CONCURRENCIA` | Followers alerted at the same time when a place changes level (5) |
| `DISPOSITIVOS_MAX_POR_USUARIO` | Push devices kept per user; registering one more evicts the oldest (10) |
| `SUSPENSION_DIAS_PERMITIDOS` | Allowed suspension lengths; must be a subset of 3,7,30 because `sancion_usuario.dias` has `CHECK (dias IN (3,7,30))` in the frozen migration 06 (3,7,30) |
| `LUGARES_Q_MIN` / `LUGARES_Q_MAX` | Length bounds of the search text `q` in `GET /api/lugares` (2 / 60) |
| `LUGARES_LIMITE_MAX` | Largest `limite` accepted by the places list, and the hard cap of `LugarDAO.buscar` and `explorar` (200) |
| `LUGARES_LIMITE_DEFAULT` | `limite` used when the request omits it; must not exceed the maximum (200) |
| `CORREO_PROVEEDOR` | `consola` or `smtp` (consola) |
| `CORREO_REMITENTE` | From address of outgoing mail |
| `SMTP_HOST` | Required with `smtp` |
| `SMTP_PUERTO` | SMTP port (587) |
| `SMTP_USUARIO` | Required with `smtp` |
| `SMTP_PASSWORD` | Required with `smtp` |
| `PUSH_PROVEEDOR` | `consola` or `fcm` (consola) |
| `PUSH_TIMEOUT_MS` | One push call is given up after this long; the alert stays stored (3000) |
| `FCM_CREDENCIALES_RUTA` | Required with `fcm` |
| `ADMIN_EMAIL` | Email of the seeded admin |
| `ADMIN_PASSWORD` | Password of the seeded admin: 10 characters minimum, not a `CAMBIAR*` placeholder |
| `SEED_SINTETICO` | Seed the synthetic demo history (on outside production, off in production when unset; see Datos de demostración) |

Test tooling only: `DATABASE_URL_TEST` (see Test).

## Production notes

- **`/api/salud` is single-flight and bounded**: concurrent probes share one `SELECT 1` and the query carries a
  server-side `statement_timeout` of 2 s (`SET LOCAL` inside its own transaction), so a saturated pool or a slow
  database cannot pile up probes. A probe can still wait for a free pool connection (up to the pool acquire timeout)
  but only one ever does. The per-email login lockout counts only authentication failures (401/404): validation
  errors and outages (400/503) never lock an account.
- **Behind a proxy or load balancer set `TRUST_PROXY`** to the number of hops (for example `1`). Left at `false`, every
  client shares the proxy's address and the per-IP rate limits throttle everybody together; `true` trusts any
  `X-Forwarded-For` and lets clients dodge the limits.
- **Keep-alive vs the balancer idle timeout.** The balancer's idle timeout (60 s on AWS ALB) must be shorter than
  `SERVIDOR_KEEPALIVE_TIMEOUT_MS` (65 s), otherwise Node closes a connection the balancer is about to reuse and clients
  see sporadic 502s. `SERVIDOR_HEADERS_TIMEOUT_MS` must stay above the keep-alive timeout (validated at boot).
- Counters of the rate limiter live in process memory: with several replicas each one counts on its own.
- Readiness: point the balancer health check at `GET /api/salud` (`503 APAGANDO` during shutdown).

## Runbook de rollback

Migrations 01-10 and 12 are frozen once released; fixes go forward as new migrations. When a release must be undone:

1. **Take a backup first** (`pg_dump -Fc crowdradar > antes-del-rollback.dump`); a `down` that drops a column or table
   destroys data for good.
2. **Stop the new API version** (scale to zero or drain it) so nothing writes while the schema changes.
3. **Undo one step at a time**: `npm run db:migrate:undo` reverts only the latest migration. Check `\d usuario` (or the
   table the migration touched) and the `SequelizeMeta` rows, then repeat only if the release added several migrations.
4. **Roll the image back** to the previous tag (the previous version must run on the older schema; every migration so
   far is additive, so it does) and start it. Verify `GET /api/salud` and a login.
5. **Do NOT use `db:migrate:undo:all` or `db:reset` outside a disposable database.** They drop every table
   (`undo:all`) and then re-seed (`reset`): all users, reports and karma are lost. They are for local and test databases.
6. **Verify `down` safety before shipping a migration**: run `db:migrate`, `db:migrate:undo` and `db:migrate` again on a
   copy of production-like data (the contract tests do this on an empty database; they cannot prove a `down` keeps data).
   Migration 12 (`password_cambiada_en`) loses only the timestamp; token invalidation by password change is lost with it.

## Decisiones

Design decisions worth knowing before changing the report flow live in [docs/decisiones.md](docs/decisiones.md): event delivery
is at-most-once after the commit (no outbox, accepted for the MVP) and report serialization uses a per-place row lock plus
per-user advisory locks.

## Security notes

- `helmet` headers, CORS allow-list, `x-powered-by` disabled, JSON body limit (`SERVIDOR_LIMITE_CUERPO`, 100 kb by default), request ids on every response.
- Passwords are bcrypt hashes (cost from config); login always runs a hash comparison, with a decoy hash for unknown emails.
- JWT is HS256 only (pinned on sign and verify), its payload is validated, and `autenticar` re-reads the user so a
  suspended account loses access immediately.
- Logs redact passwords, tokens, `Authorization`, cookies, validation `fields`/`errors[*].value` and database error
  details (SQL text, bound values); secret keys are matched at any depth up to five levels.
- Rate limits count every attempt per IP; login also locks an email after `LIMITE_LOGIN` failed attempts from any IP
  (`429 DEMASIADOS_INTENTOS`, `Retry-After`). Trade-off: anyone can lock a known email for one window; the alternative
  (per IP+email) would let a distributed attacker guess freely. Counters are in memory, per process.
- Changing the password invalidates every token issued before the change (`usuario.password_cambiada_en`).
- `POST /api/auth/register` answers `409 EMAIL_DUPLICADO`, which lets a client discover whether an email is registered.
  Accepted trade-off: the Sprint 1 frontend contract needs that code to show the "email already used" message, and the
  per-IP register limit slows enumeration. Revisit if the product stops needing the explicit message.
- No secret is tracked: `.env` is ignored, `.env.example` only has placeholders that fail validation.

## Baseline

The tag `sprint1-js` marks the original JavaScript Sprint 1 code, replaced by this TypeScript layering.
