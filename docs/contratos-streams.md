# Stream contracts (hand-off of change 0)

Change 0 froze the ports; streams M1 to M6 implement them in parallel against the in-memory fakes
(`test/support/dao/`, `test/support/adapter/`) and wire the real thing only in their own
`src/container/<stream>.ts`. Paths below are relative to `src/`. The HTTP side (paths, methods, middleware
chains, error codes) is in `docs/api-contract.md`; every route is a 501 stub until its stream replaces the
handler in `route/<modulo>.routes.ts`.

Rules that apply to every stream:

- Layering: controller -> facade/service (interfaces only) -> DAO (interface) -> `dao/impl/sequelize`. Services
  never import `impl/` (the composition root `container/` is the only exception). `sequelize` is imported only
  under `datasource/impl` and `dao/impl/sequelize`.
- A frozen port signature changes only through a contract PR reviewed by the owner and by every stream that
  consumes it (see "Shared ports" in each section). Adding a method is a contract change too.
- Schema changes are new migrations; the ten delivered migrations are never edited.
- Transactions: a service receives `ContextoTx` from its facade and passes it to the DAOs. Events are published
  after the commit, never inside it.
- Tests: write the failing test first; use the ports' fakes (`CorreoEspia`, `NotificadorEspia`,
  `GeneradorTokenFijo`, `RelojFijo`, `UsuarioDAOMemoria`, ...) and `crearContenedorPrueba`.

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
- Middleware, errors, config, connection, clock (`util/Reloj.ts`) and the 10 migrations.

## M1 Security: password recovery

Interfaces to implement:

- `facade/RecuperacionFacade.ts` (Pattern: Facade) with a `RecuperacionController` and the 4 recovery routes.
- `dao/TokenRecuperacionDAO.ts` -> `TokenRecuperacionDAOSequelize`.
- `adapter/correo/EnviadorCorreo.ts` -> `NodemailerCorreoAdapter` (SMTP; `ConsolaCorreoAdapter` already exists).

Owned files: `facade/RecuperacionFacade*`, `controller/RecuperacionController.ts`, `route/recuperacion.routes.ts`,
`dao/impl/sequelize/TokenRecuperacionDAOSequelize.ts`, `adapter/correo/impl/NodemailerCorreoAdapter.ts`,
`container/seguridad.ts`, `exception/recuperacion/*`, `dto/**/recuperacion/*`, `view/restablecer.html`,
`passwordSeguraSchema` (8..64 characters, an uppercase letter and a digit).

Shared ports needing a contract PR: `adapter/seguridad/GeneradorToken.ts` and `adapter/correo/EnviadorCorreo.ts`
(M6 also sends mail), `dao/UsuarioDAO.ts` (`actualizarPasswordHash`).

## M2 Geospatial: places and search

Interfaces to implement:

- `service/LugarService.ts` (Pattern: Service layer) -> `LugarServiceImpl`.
- `dao/LugarDAO.ts` -> `LugarDAOSequelize` (`explorar` delegates to M3's `filtroExploracion`).

Owned files: `service/impl/LugarServiceImpl.ts`, `controller/LugarController.ts`, `mapper/LugarMapper.ts`,
`entity/HorarioAtencion.ts` (`estaAbierto(ahora, zona)`), `dao/impl/sequelize/LugarDAOSequelize.ts`,
`route/lugar.routes.ts` (keep `/lugares/explorar` and `/lugares/categorias` before `/lugares/:id`),
`container/lugar.ts`, `exception/lugar/*`, `dto/**/lugar/*`, seeder `20261005100002-lugares-lima`,
`database/data/lugares-lima.json`, `scripts/exportar-lugares-osm.ts`. The map adapter belongs to the mobile app.

Shared ports needing a contract PR: `dao/LugarDAO.ts` (consumed by M3 and M4), `dao/FavoritoDAO.ts` (`esFavorito`
read) and `dao/ReporteDAO.ts` (`contarPorLugarDesde` read).

## M3 Favourites and alerts, exploration

Interfaces to implement:

- `service/ExploracionService.ts`, `service/FavoritoService.ts`, `service/AlertaService.ts` (Pattern: Service layer).
- `pattern/observer/SaturacionObserver.ts` -> `AlertaFavoritosObserver` (Pattern: Observer; subscribes in
  `container/favoritoAlerta.ts`).
- `adapter/push/NotificadorPush.ts` -> `FcmNotificadorAdapter` (`ConsolaNotificadorAdapter` already exists).
- `dao/FavoritoDAO.ts`, `dao/AlertaDAO.ts`, `dao/DispositivoDAO.ts` -> Sequelize implementations.

Owned files: `service/impl/{Exploracion,Favorito,Alerta}ServiceImpl.ts`, `controller/{Exploracion,Favorito,Alerta}Controller.ts`,
`mapper/{Favorito,Alerta}Mapper.ts`, `pattern/observer/AlertaFavoritosObserver.ts`, `util/geo.ts`,
`dao/impl/sequelize/lugar/filtroExploracion.ts`, `dao/impl/sequelize/{Favorito,Alerta,Dispositivo}DAOSequelize.ts`,
`adapter/push/impl/FcmNotificadorAdapter.ts`, `route/{favorito,alerta}.routes.ts`, `container/favoritoAlerta.ts`,
`exception/{favorito,alerta}/*`, `dto/**/{favorito,alerta}/*`.

Shared ports needing a contract PR: `pattern/observer/SaturacionCambiadaEvento.ts` (payload owned jointly with M4),
`adapter/push/NotificadorPush.ts`, `dao/LugarDAO.ts` (`explorar`, `FiltroExploracion`).

## M4 Reports, karma and analytics

Interfaces to implement:

- `facade/ReporteFacade.ts` (Pattern: Facade), `service/ReporteService.ts`, `service/KarmaService.ts`,
  `service/SaturacionService.ts`, `service/AnaliticaService.ts`.
- `pattern/strategy/saturacion/EstrategiaSaturacion.ts` (Pattern: Strategy) -> `SaturacionPonderadaStrategy`,
  `SaturacionUltimoReporteStrategy`, chosen by `SATURACION_ESTRATEGIA`.
- `dao/ReporteDAO.ts` -> `ReporteDAOSequelize` (M5 adds `listarPendientesDeValidar` and `actualizarConfiabilidad`).
- `pattern/observer/SaturacionSubject.ts` as publisher (the only emitter together with M6).

Owned files: `facade/ReporteFacade*`, `service/impl/{Reporte,Karma,Saturacion,Analitica}ServiceImpl.ts`,
`pattern/strategy/saturacion/impl/*`, `controller/{Reporte,Analitica}Controller.ts`, `mapper/{Reporte,Analitica}Mapper.ts`,
`dao/impl/sequelize/ReporteDAOSequelize.ts`, `route/{reporte,analitica}.routes.ts` (`/reportes/mios` before
`/reportes/:id`), `container/reporte.ts`, `exception/reporte/*`, `dto/**/reporte/*`, seeder `20261005100003-demo-historial`
(synthetic, declared as such).

Shared ports needing a contract PR: `dao/ReporteDAO.ts`, `service/KarmaService.ts` and `service/SaturacionService.ts`
(called by M5 and M6), `pattern/observer/SaturacionCambiadaEvento.ts`, `dao/LugarDAO.ts` (`actualizarSaturacion`),
`dao/UsuarioDAO.ts` (`incrementarKarma`).

## M5 Validation and complaints

Interfaces to implement:

- `service/ValidacionService.ts`, `service/DenunciaService.ts` (Pattern: Service layer; Strategy context for reliability).
- `pattern/strategy/confiabilidad/EstrategiaConfiabilidad.ts` (Pattern: Strategy) -> `ConfiabilidadPonderadaKarmaStrategy`,
  `ConfiabilidadSimpleStrategy`, chosen by `CONFIABILIDAD_ESTRATEGIA`.
- `dao/ValidacionDAO.ts`, `dao/DenunciaDAO.ts` -> Sequelize implementations.

Owned files: `service/impl/{Validacion,Denuncia}ServiceImpl.ts`, `pattern/strategy/confiabilidad/impl/*`,
`controller/{Validacion,Denuncia}Controller.ts`, `mapper/{Validacion,Denuncia}Mapper.ts`,
`dao/impl/sequelize/{Validacion,Denuncia}DAOSequelize.ts`, `route/validacion.routes.ts`, `container/validacion.ts`
(receives M4's `KarmaService`), `exception/validacion/*`, `dto/**/validacion/*`, `enum/EstadoValidacion.ts`.

Shared ports needing a contract PR: `dao/ReporteDAO.ts` (`listarPendientesDeValidar`, `actualizarConfiabilidad`,
owned by M4), `service/KarmaService.ts` (M4), `dao/DenunciaDAO.ts` (M6 resolves what M5 creates).

## M6 Moderation

Interfaces to implement:

- `facade/ModeracionFacade.ts` (Pattern: Facade) with a `ModeracionController` (7 admin routes).
- `service/VerificadorEstadoCuenta.ts` -> sanction-aware implementation (reactivates when a sanction expired).
- `dao/SancionDAO.ts` -> `SancionDAOSequelize`.

Owned files: `facade/ModeracionFacade*`, `service/impl/VerificadorEstadoCuentaImpl.ts` (replaces the C0 minimum),
`controller/ModeracionController.ts`, `mapper/ModeracionMapper.ts`, `dao/impl/sequelize/SancionDAOSequelize.ts`,
`route/moderacion.routes.ts`, `container/moderacion.ts`, `exception/moderacion/*`, `dto/**/moderacion/*`.

Shared ports needing a contract PR: `service/KarmaService.ts` and `service/SaturacionService.ts` (M4),
`dao/DenunciaDAO.ts` (`resolverPendientes`), `dao/UsuarioDAO.ts` (`listar`, `actualizarStatus`),
`adapter/correo/EnviadorCorreo.ts` (M1), `pattern/observer/SaturacionSubject.ts`.
