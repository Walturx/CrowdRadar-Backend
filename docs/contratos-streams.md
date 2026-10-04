# Stream contracts (hand-off of change 0)

Change 0 froze the ports; streams M1 to M6 implement them in parallel against the in-memory fakes
(`test/support/dao/`, `test/support/adapter/`) and wire the real thing only in their own
`src/container/<stream>.ts`. Paths below are relative to `src/` unless they start with `test/`, `docs/` or
`database/`. The HTTP side (paths, methods, middleware chains, error codes) is in `docs/api-contract.md`; every
route is a 501 stub until its stream replaces the handler in `route/<modulo>.routes.ts`.

## Rules that apply to every stream

- Layering: controller -> facade/service (interfaces only) -> DAO (interface) -> `dao/impl/sequelize`. Services
  never import `impl/` (the composition root `container/` is the only exception). `sequelize` is imported only
  under `datasource/impl` and `dao/impl/sequelize`.
- Contract PR rule: a frozen port signature changes only through a contract PR. Its target branch is the C0 tracker
  (`feat/c0-backend-foundation`) until it merges and `main` afterwards (the backend default branch). The approvers
  are the port owner (named in each "Shared ports" entry) plus the lead; every stream listed as Reviewer of that
  port is requested too. Adding a method is a contract change as well. Nobody merges a contract PR for a port they
  own without the lead.
- Reads and Writes: in each "Shared ports" entry, Reads are the query methods the stream only calls and Writes are
  the mutating methods it calls. Reviewers are the other streams that call the port; a Writes change needs their
  explicit approval, a Reads change needs it too if the result shape moves.
- Method names are exactly the ones in the code, never paraphrased: for example `buscarUltimoDeUsuarioEnLugar` (not
  "ultimo reporte"), and `agregarPorHora`, which returns hourly buckets only: the day and week views aggregate by
  day in the service layer, the DAO never groups by day.
- `SaturacionCambiadaEvento` carries `nivelAnterior` and `nivelNuevo` as nullable values (null means no known level:
  first report ever or a stale reading); every observer must handle null on both sides.
- Mappers own the DTO <-> entity translation (`mapper/<X>Mapper.ts`). Services take and return domain types, so a
  stream must not duplicate service request shapes in `dto/`; `dto/` holds only the HTTP request and response shapes.
- Schema changes are new migrations; the delivered migrations (`database/migrations/20261005000001` to `000010` and
  `000012`) are never edited.
- Transactions: a service receives `ContextoTx` from its facade and passes it to the DAOs. Events are published
  after the commit, never inside it. `PublicadorSaturacion` awaits subscribers one at a time, so a slow subscriber
  delays the ones after it; keep observers fast.
- Every port doc comment states its pattern (`Pattern:`) and its owning stream (`Owner:`); a new port does too
  (`test/ops/contratosStreams.unit.test.ts` enforces it, and that every method named below exists in its file).

### How to run tests

- `npm test`: the whole suite with no database and no network. This is what you run while developing.
- `npm run test:db`: the same suite including the database-backed tests; it refuses to run without
  `DATABASE_URL_TEST` (a throwaway PostgreSQL such as `postgres://crowdradar:<password>@localhost:5432/crowdradar_test`;
  the tests create and drop temporary databases next to it).
- DAO contract against your Sequelize implementation: every DAO port has a shared contract
  (`test/dao/<Nombre>DAO.contract.ts`) that its in-memory fake already passes. Run the SAME contract on your
  implementation with `ejecutarContratoDAO` (`test/dao/ejecutarContratoDAO.ts`); copy
  `test/dao/plantilla.sequelize.contract.test.ts.md`, and `UsuarioDAOSequelize.contract.test.ts` is the worked example.
  A contract case you disagree with is changed through a contract PR, never edited in your own PR.
- Write the failing test first. Fakes: `CorreoEspia`, `NotificadorEspia`, `GeneradorTokenFijo`, `RelojFijo`,
  `UsuarioDAOMemoria` and the other `*DAOMemoria`, `crearContenedorPrueba`. The in-memory DAOs return copies, take
  their timestamps from the injected `Reloj` and, when you pass them a `crearSembradorMemoria()` registry, throw the
  same `ForeignKeyConstraintError` as the database for an unknown `usuarioId`, `lugarId` or `favoritoId`.

## Delivered by C0 (do not reimplement)

Interfaces to implement: none. Available to every stream:

- Auth and users: `service/AuthService.ts`, `service/UsuarioService.ts`, `service/VerificadorEstadoCuenta.ts`
  (M6 completes the suspension-aware version).
- Security adapters: `adapter/seguridad/Hasher.ts`, `adapter/seguridad/EmisorToken.ts`,
  `adapter/seguridad/GeneradorToken.ts`.
- Mail and push ports with console adapters: `adapter/correo/EnviadorCorreo.ts`, `adapter/push/NotificadorPush.ts`.
- Events: `pattern/observer/SaturacionCambiadaEvento.ts`, `pattern/observer/SaturacionObserver.ts`,
  `pattern/observer/SaturacionSubject.ts` (the `PublicadorSaturacion` implementation isolates subscriber failures).
- Persistence ports (10): `dao/UsuarioDAO.ts`, `dao/LugarDAO.ts`, `dao/ReporteDAO.ts`, `dao/ValidacionDAO.ts`,
  `dao/DenunciaDAO.ts`, `dao/SancionDAO.ts`, `dao/FavoritoDAO.ts`, `dao/AlertaDAO.ts`, `dao/DispositivoDAO.ts`,
  `dao/TokenRecuperacionDAO.ts`.
- Middleware, errors, config, connection, clock (`util/Reloj.ts`) and the delivered migrations.

## M1 Security: password recovery

Interfaces to implement:

- `facade/RecuperacionFacade.ts` (Pattern: Facade) with `controller/RecuperacionController.ts` and the 4 recovery
  routes in `route/recuperacion.routes.ts`.
- `dao/TokenRecuperacionDAO.ts` -> `dao/impl/sequelize/TokenRecuperacionDAOSequelize.ts`.
- `adapter/correo/EnviadorCorreo.ts` -> `adapter/correo/impl/NodemailerCorreoAdapter.ts` (SMTP;
  `ConsolaCorreoAdapter` already exists).

Owned files: `facade/RecuperacionFacade*`, `controller/RecuperacionController.ts`, `route/recuperacion.routes.ts`,
`dao/impl/sequelize/TokenRecuperacionDAOSequelize.ts`, `adapter/correo/impl/NodemailerCorreoAdapter.ts`,
`container/seguridad.ts`, `exception/recuperacion/*`, `dto/**/recuperacion/*`, `view/restablecer.html`,
`passwordSeguraSchema` (8..64 characters, an uppercase letter and a digit).

Must not touch: other streams' owned files, `container/index.ts` mount order, `middleware/*`, `exception/http/*`,
the delivered migrations, and the ports of other streams (`dao/UsuarioDAO.ts` changes only through a contract PR).

Shared ports (contract PR required):

- `adapter/seguridad/GeneradorToken.ts`: owner M1. Reviewer: lead. Reads: `generar`, `hashear` (pure helpers).
- `adapter/correo/EnviadorCorreo.ts`: owner M1. Reviewer: M6 (it also sends mail). Writes: `enviar`.
- `dao/UsuarioDAO.ts`: owner C0. Reviewer: lead, M4, M6. Reads: `buscarPorId`, `buscarPorEmail`. Writes:
  `actualizarPasswordHash`.

How to run tests: `npm test` for the facade and the Nodemailer adapter (use `CorreoEspia` and `GeneradorTokenFijo`);
`npm run test:db` with `DATABASE_URL_TEST` runs `TokenRecuperacionDAOSequelize` through `ejecutarContratoDAO` and
the `contratoTokenRecuperacionDAO` contract (`test/dao/TokenRecuperacionDAO.contract.ts`).

## M2 Geospatial: places and search

Interfaces to implement:

- `service/LugarService.ts` (Pattern: Service layer) -> `service/impl/LugarServiceImpl.ts`.
- `dao/LugarDAO.ts` -> `dao/impl/sequelize/LugarDAOSequelize.ts` (`explorar` delegates to M3's `filtroExploracion`).

Owned files: `service/impl/LugarServiceImpl.ts`, `controller/LugarController.ts`, `mapper/LugarMapper.ts`,
`entity/HorarioAtencion.ts` (`estaAbierto(ahora, zona)`), `dao/impl/sequelize/LugarDAOSequelize.ts`,
`route/lugar.routes.ts` (keep `/lugares/explorar` and `/lugares/categorias` before `/lugares/:id`),
`container/lugar.ts`, `exception/lugar/*`, `dto/**/lugar/*`, seeder `20261005100002-lugares-lima`,
`database/data/lugares-lima.json`, `scripts/exportar-lugares-osm.ts`. The map adapter belongs to the mobile app.
The search result type is `ResultadoBusquedaLugar` (`service/LugarService.ts`) and `Bbox` lives in `entity/Bbox.ts`.

Must not touch: `dao/impl/sequelize/lugar/filtroExploracion.ts` (M3), `dao/impl/sequelize/ReporteDAOSequelize.ts` and
`dao/impl/sequelize/Favorito*` (their owners), `container/index.ts` mount order, the delivered migrations.

Shared ports (contract PR required):

- `dao/LugarDAO.ts`: owner M2. Reviewer: M3, M4. Reads: `buscarPorId`, `buscarPorIds`, `buscar`, `explorar`,
  `contarPorCategoria`, `FiltroExploracion`.
- `dao/FavoritoDAO.ts`: owner M3. Reviewer: M3. Reads: `buscar` (esFavorito and alertasActivadas of the detail).
- `dao/ReporteDAO.ts`: owner M4. Reviewer: M4. Reads: `contarPorLugarDesde`.

How to run tests: `npm test` for the service (fake `LugarDAOMemoria`, `FavoritoDAOMemoria`, `ReporteDAOMemoria`);
`npm run test:db` with `DATABASE_URL_TEST` runs `LugarDAOSequelize` through `ejecutarContratoDAO` and
`contratoLugarDAO`, plus the seeder data test.

## M3 Favourites and alerts, exploration

Interfaces to implement:

- `service/ExploracionService.ts`, `service/FavoritoService.ts`, `service/AlertaService.ts` (Pattern: Service layer)
  -> `service/impl/{Exploracion,Favorito,Alerta}ServiceImpl.ts`.
- `pattern/observer/SaturacionObserver.ts` -> `pattern/observer/AlertaFavoritosObserver.ts` (Pattern: Observer;
  subscribes in `container/favoritoAlerta.ts`).
- `adapter/push/NotificadorPush.ts` -> `adapter/push/impl/FcmNotificadorAdapter.ts` (`ConsolaNotificadorAdapter`
  already exists).
- `dao/FavoritoDAO.ts`, `dao/AlertaDAO.ts`, `dao/DispositivoDAO.ts` -> `dao/impl/sequelize/{Favorito,Alerta,Dispositivo}DAOSequelize.ts`.

Owned files: `service/impl/{Exploracion,Favorito,Alerta}ServiceImpl.ts`, `controller/{Exploracion,Favorito,Alerta}Controller.ts`,
`mapper/{Favorito,Alerta}Mapper.ts`, `pattern/observer/AlertaFavoritosObserver.ts`, `util/geo.ts`,
`dao/impl/sequelize/lugar/filtroExploracion.ts`, `dao/impl/sequelize/{Favorito,Alerta,Dispositivo}DAOSequelize.ts`,
`adapter/push/impl/FcmNotificadorAdapter.ts`, `route/{favorito,alerta}.routes.ts`, `container/favoritoAlerta.ts`,
`exception/{favorito,alerta}/*`, `dto/**/{favorito,alerta}/*`.

Must not touch: `dao/impl/sequelize/LugarDAOSequelize.ts` (M2; you only provide `filtroExploracion`),
`pattern/observer/PublicadorSaturacion.ts`, `container/index.ts` mount order, the delivered migrations.

Shared ports (contract PR required):

- `pattern/observer/SaturacionCambiadaEvento.ts`: owner M4 (payload shared with M3). Reviewer: M4. Reads:
  `SaturacionCambiadaEvento` (nullable `nivelAnterior` and `nivelNuevo`).
- `pattern/observer/SaturacionSubject.ts`: owner M4. Reviewer: M4, M6. Writes: `suscribir`.
- `adapter/push/NotificadorPush.ts`: owner M3. Reviewer: lead. Writes: `enviar`.
- `dao/LugarDAO.ts`: owner M2. Reviewer: M2, M4. Reads: `buscarPorId`, `buscarPorIds`, `explorar`, `FiltroExploracion`.

How to run tests: `npm test` (the observer runs against `NotificadorEspia` and the in-memory DAOs, which cascade a
deleted favourite to its alerts); `npm run test:db` with `DATABASE_URL_TEST` runs the three Sequelize DAOs through
`ejecutarContratoDAO`; pass `alertas` to the favourite contract environment so the cascade case runs.

## M4 Reports, karma and analytics

Interfaces to implement:

- `facade/ReporteFacade.ts` (Pattern: Facade), `service/ReporteService.ts`, `service/KarmaService.ts`,
  `service/SaturacionService.ts`, `service/AnaliticaService.ts` -> `service/impl/{Reporte,Karma,Saturacion,Analitica}ServiceImpl.ts`.
- `pattern/strategy/saturacion/EstrategiaSaturacion.ts` (Pattern: Strategy) ->
  `pattern/strategy/saturacion/impl/SaturacionPonderadaStrategy.ts` and `SaturacionUltimoReporteStrategy.ts`, chosen
  by `SATURACION_ESTRATEGIA`.
- `dao/ReporteDAO.ts` -> `dao/impl/sequelize/ReporteDAOSequelize.ts`, including `listarPendientesDeValidar` and
  `actualizarConfiabilidad` (already in the port; M5 only calls them).
- `pattern/observer/SaturacionSubject.ts` as publisher (the only emitter together with M6), through `PublicadorSaturacion`.

Owned files: `facade/ReporteFacade*`, `service/impl/{Reporte,Karma,Saturacion,Analitica}ServiceImpl.ts`,
`pattern/strategy/saturacion/impl/*`, `controller/{Reporte,Analitica}Controller.ts`, `mapper/{Reporte,Analitica}Mapper.ts`,
`dao/impl/sequelize/ReporteDAOSequelize.ts`, `route/{reporte,analitica}.routes.ts` (`/reportes/mios` before
`/reportes/:id`), `container/reporte.ts`, `exception/reporte/*`, `dto/**/reporte/*`, seeder `20261005100003-demo-historial`
(synthetic, declared as such).

Must not touch: `service/impl/Validacion*` and `service/impl/Denuncia*` (M5), `dao/impl/sequelize/LugarDAOSequelize.ts`
(M2; you call `actualizarSaturacion` only), `container/index.ts` mount order, the delivered migrations.

Shared ports (contract PR required):

- `dao/ReporteDAO.ts`: owner M4. Reviewer: M2, M5, M6. Reads: `buscarPorId`, `buscarUltimoDeUsuarioEnLugar`,
  `listarRecientesPorLugar`, `contarPorLugarDesde`, `contarPremiadosDeUsuarioDesde`, `listarPorUsuario`,
  `agregarPorHora`. Writes: `crear`, `registrarPuntos`, `actualizarEstado`, `actualizarConfiabilidad`.
- `service/KarmaService.ts`: owner M4. Reviewer: M5, M6. Writes: `otorgarPorReporte`, `otorgarPorValidacion`,
  `revocarPorReporteEliminado`.
- `service/SaturacionService.ts`: owner M4. Reviewer: M6. Writes: `recalcular`.
- `pattern/observer/SaturacionCambiadaEvento.ts`: owner M4. Reviewer: M3. Writes: `crearEventoSaturacion`.
- `dao/LugarDAO.ts`: owner M2. Reviewer: M2, M3. Reads: `buscarPorId`. Writes: `actualizarSaturacion`.
- `dao/UsuarioDAO.ts`: owner C0. Reviewer: lead, M1, M6. Writes: `incrementarKarma`.

How to run tests: `npm test` (strategies and services with `ReporteDAOMemoria`, `RelojFijo`);
`npm run test:db` with `DATABASE_URL_TEST` runs `ReporteDAOSequelize` through `ejecutarContratoDAO` and
`contratoReporteDAO` (it covers `agregarPorHora` buckets and the pagination tie-break: `ORDER BY fecha_hora DESC, id DESC`).

M4 notes (delivered in the BE-01..03 slices):

- The cooldown runs inside the report transaction: `ReporteService.validarCooldown(usuarioId, lugarId, tx)` calls
  `ReporteDAO.buscarUltimoDeUsuarioEnLugar(..., tx)`, which in PostgreSQL takes `pg_advisory_xact_lock(usuarioId, lugarId)`
  until the transaction ends, so two simultaneous reports of the same pair never both pass the check. No port signature
  changed (both already received `tx`); `ReporteFacade.registrar` checks the place first (404, nothing written), then opens
  the transaction.
- `ReporteDAOMemoria` emulates that lock per transaction handle: use `ConexionFalsa.transaccion` (it opens and closes the
  handle) when a test needs the mutual exclusion. Shared cases: `test/dao/ReporteDAO.concurrencia.contract.ts`.
- `container/reporte.ts` exports `construirServiciosReporte` and `elegirEstrategiaSaturacion` (strategy picked by
  `SATURACION_ESTRATEGIA`). M5 and M6 take `karmaService` and `saturacionService` from it. `construirReporte` now builds
  the facade and mounts `ReporteController` (POST /reportes, GET /reportes/mios).
- Contract touch (M4-BE-04): `DependenciasInfraestructura` gained `lugarDAO` and `reporteDAO` (Sequelize in
  `crearContenedor`, in memory in `crearContenedorPrueba`) and `Infraestructura` gained the shared `subject`
  (`PublicadorSaturacion`, one instance for M3 to subscribe to and M4/M6 to publish through). When M2 wires its own
  `lugarDAO` in `crearContenedor` the line is the same one: keep a single instance.
- Contract touch (M4-BE-04): `ReporteService.listarMios(usuarioId, paginacion)` now returns
  `Pagina<{ reporte, lugarNombre }>` (the interim first page of 50 is gone); `ReporteServiceImpl` takes a `LugarDAO`.
- Contract touch (M4-BE-05): `AnaliticaService` was reshaped from the frozen sketch (`PuntoHistorial[]` / `{ a, b }`) to the
  results the app parses (`ResultadoHistorial`, `ResultadoComparacion`, `ResultadoMejorHorario`; `hayDatos`/`suficiente`,
  `sintetico`); `ReporteDAO` gained `hayReportesSinteticos(consulta)` (implemented in the Sequelize class and in
  `ReporteDAOMemoria`; the shared `Sembrador` gained `usuarioSintetico()`). `DependenciasInfraestructura` gained an optional
  `reloj` (the system clock when omitted). The demo-user marker is the email domain in `util/sintetico.ts`.
- Test file names: rubric kinds end in `.unit.test.ts` (e.g. `SaturacionPonderadaStrategy.whitebox.unit.test.ts`), since
  `convenciones.unit.test.ts` only accepts `.unit`, `.api` and `.contract`.

## M5 Validation and complaints

Interfaces to implement:

- `service/ValidacionService.ts`, `service/DenunciaService.ts` (Pattern: Service layer; Strategy context for
  reliability) -> `service/impl/{Validacion,Denuncia}ServiceImpl.ts`.
- `pattern/strategy/confiabilidad/EstrategiaConfiabilidad.ts` (Pattern: Strategy) ->
  `pattern/strategy/confiabilidad/impl/ConfiabilidadPonderadaKarmaStrategy.ts` and `ConfiabilidadSimpleStrategy.ts`,
  chosen by `CONFIABILIDAD_ESTRATEGIA`.
- `dao/ValidacionDAO.ts`, `dao/DenunciaDAO.ts` -> `dao/impl/sequelize/{Validacion,Denuncia}DAOSequelize.ts`.

Owned files: `service/impl/{Validacion,Denuncia}ServiceImpl.ts`, `pattern/strategy/confiabilidad/impl/*`,
`controller/{Validacion,Denuncia}Controller.ts`, `mapper/{Validacion,Denuncia}Mapper.ts`,
`dao/impl/sequelize/{Validacion,Denuncia}DAOSequelize.ts`, `route/validacion.routes.ts`, `container/validacion.ts`
(receives M4's `KarmaService`), `exception/validacion/*`, `dto/**/validacion/*`, `enum/EstadoValidacion.ts`.

Must not touch: `dao/impl/sequelize/ReporteDAOSequelize.ts` and `service/impl/Karma*` (M4), `facade/ModeracionFacade*`
(M6), `container/index.ts` mount order, the delivered migrations.

Shared ports (contract PR required):

- `dao/ReporteDAO.ts`: owner M4. Reviewer: M4. Reads: `buscarPorId`, `listarPendientesDeValidar`. Writes:
  `actualizarConfiabilidad`.
- `service/KarmaService.ts`: owner M4. Reviewer: M4, M6. Writes: `otorgarPorValidacion`.
- `dao/DenunciaDAO.ts`: owner M5 (creates what M6 resolves). Reviewer: M6. Reads: `existe`, `contarRecibidasPorAutor`.
  Writes: `crear`.

How to run tests: `npm test` (strategies and services with `ValidacionDAOMemoria`, `DenunciaDAOMemoria`);
`npm run test:db` with `DATABASE_URL_TEST` runs both Sequelize DAOs through `ejecutarContratoDAO`; the denuncia
environment needs a Sembrador that inserts real reports, so `contarRecibidasPorAutor` can join them.

## M6 Moderation

Interfaces to implement:

- `facade/ModeracionFacade.ts` (Pattern: Facade) with `controller/ModeracionController.ts` (7 admin routes in
  `route/moderacion.routes.ts`).
- `service/VerificadorEstadoCuenta.ts` -> `service/impl/VerificadorEstadoCuentaImpl.ts`, sanction-aware
  (reactivates when a sanction expired).
- `dao/SancionDAO.ts` -> `dao/impl/sequelize/SancionDAOSequelize.ts`.

Owned files: `facade/ModeracionFacade*`, `service/impl/VerificadorEstadoCuentaImpl.ts` (replaces the C0 minimum),
`controller/ModeracionController.ts`, `mapper/ModeracionMapper.ts`, `dao/impl/sequelize/SancionDAOSequelize.ts`,
`route/moderacion.routes.ts`, `container/moderacion.ts`, `exception/moderacion/*`, `dto/**/moderacion/*`.
`SancionUsuario.dias` is `DiasSuspension` (3, 7 or 30) and `tipo` is the `TipoSancion` enum.

Must not touch: `service/impl/Karma*` and `service/impl/Saturacion*` (M4; call the ports), `dao/impl/sequelize/DenunciaDAOSequelize.ts`
(M5), `middleware/autenticar.ts`, `container/index.ts` mount order, the delivered migrations.

Shared ports (contract PR required):

- `service/KarmaService.ts`: owner M4. Reviewer: M4, M5. Writes: `revocarPorReporteEliminado`.
- `service/SaturacionService.ts`: owner M4. Reviewer: M4. Writes: `recalcular`.
- `dao/ReporteDAO.ts`: owner M4. Reviewer: M4, M5. Writes: `actualizarEstado`.
- `dao/DenunciaDAO.ts`: owner M5. Reviewer: M5. Reads: `listarReportesConPendientes`, `resumirMotivos`. Writes:
  `resolverPendientes`.
- `dao/UsuarioDAO.ts`: owner C0. Reviewer: lead, M1, M4. Reads: `listar`. Writes: `actualizarStatus`.
- `adapter/correo/EnviadorCorreo.ts`: owner M1. Reviewer: M1. Writes: `enviar`.
- `pattern/observer/SaturacionSubject.ts`: owner M4. Reviewer: M3, M4. Writes: `notificar`.

How to run tests: `npm test` (facade with `SancionDAOMemoria`, `CorreoEspia`, `RelojFijo`); `npm run test:db` with
`DATABASE_URL_TEST` runs `SancionDAOSequelize` through `ejecutarContratoDAO` and `contratoSancionDAO`.
