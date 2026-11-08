# Design decisions

Short notes on decisions a reader of the code might question. Each says what was decided, why, and what is accepted.

## D1. Event delivery: at-most-once after the commit, no outbox (accepted for the MVP)

**Decision.** `ReporteFacadeImpl.registrar` commits the transaction (report and place saturation) and only then
publishes `SaturacionCambiadaEvento` on the `SaturacionSubject`. The answer waits for the publication at most
`EVENTOS_PRESUPUESTO_MS` (500 ms); past that it goes out anyway and the delivery finishes in the background. Every subscriber
fails in isolation (logged, never rethrown). There is no outbox and no persistent queue.

**Guarantee.** Delivery is **at-most-once**: if the process dies between the commit and the publication (or during it), the
event is lost and is not retried. The report and the place saturation are **never** lost: they share the transaction.

**Why the MVP accepts it.**

- The in-app alert is a convenience notice: the map and the place detail read the current saturation from `lugar`, so a lost
  event only delays one notice, it never leaves wrong data behind.
- Publishing before the commit would be worse (notices about changes that are later rolled back) and an outbox adds a table, a
  worker and their operation, which is out of proportion for the scope of the course.

**How to reconcile if it is ever needed.** `lugar.saturacion_actualizada_en` stores the instant of the last recomputation of
each place. A reconciliation job can compare it with the date of the latest alert generated for the place (`alerta.fecha_hora`)
and publish the missing change again. If the product needs guaranteed delivery, the next step is a transactional outbox (a
`evento_pendiente` table written in the same transaction and drained by a worker); the `SaturacionSubject` contract does not change.

## D2. Report serialization: per user and place, then per place

Two locks inside the same transaction, always in this order (no cycle is possible):

1. `pg_advisory_xact_lock(usuarioId, lugarId)` at the cooldown check: two simultaneous reports of one user on one place run one
   after the other (the second one sees the first row and gets 422).
2. `SELECT ... FOR UPDATE` on the `lugar` row (`LugarDAO.buscarPorIdParaActualizar`): reports of different users on the same
   place recompute the saturation one after the other, so the final level and the published changes reflect all of them.

A third, per-user lock (`pg_advisory_xact_lock(usuarioId, 0)`) only kept a daily cap of points exact; it went away with the cap
(D-CRO-72), so reports of one user on different places no longer wait for each other.

`DB_LOCK_TIMEOUT_MS` bounds the wait for a lock; a deadlock, a serialization failure or that timeout answer `503
SERVICIO_NO_DISPONIBLE` with `Retry-After`, and the client may send the request again.

## D-M5-1. Votes are accepted on any report that is not removed

A user may vote on any report whose estado is not ELIMINADO, however old it is and wherever the place is; the pending list
(`/validaciones/pendientes`) only suggests recent, nearby reports, it is not a precondition of voting. The spec asks for this
and it keeps the vote idempotent for a report reached from an alert or from the map.

Risk: farming points by voting on many old reports. Mitigation: a vote only earns while it matches the report's final state
(VALIDADO or RECHAZADO, which needs `CONFIABILIDAD_MIN_VOTOS_ESTADO` votes from other users), one vote per user and report
(unique index) and a rate limit per user (`LIMITE_VALIDACIONES` votes and `LIMITE_DENUNCIAS` complaints per hour,
`429 DEMASIADAS_SOLICITUDES`). The votes of one report are serialized with `SELECT ... FOR UPDATE` on its row, so each
recomputation of `nivel_confiabilidad` sees every earlier vote.

## D-CRO-73. Every valid vote weighs the same

**Decision.** A report's reliability is `100 x confirmations / votes` (2 decimals, half up): every valid vote weighs 1,
whoever casts it. The karma-weighted variant, the variable that chose it and its weight cap were removed; the
`EstrategiaConfiabilidad` port stays with `ConfiabilidadSimpleStrategy` as its only implementation, so a new rule can be
swapped in without touching `ValidacionServiceImpl`. The thresholds and minimum votes did not change.

**Why.** The score now only describes participation (CRO-62); letting it buy weight would let a few active users decide what
is VALIDADO, and VALIDADO is exactly what earns points, a loop that rewards the same people twice. The percentage is computed
from the integer counts in one division, so it is exact and any SQL that derives the same state rounds the same way.

**Accepted.** The voter's former score column in `validacion_reporte` no longer influences anything; migration 15 drops it
(D-CRO-72-COLUMNAS).

## D-CRO-72. Points and tiers are computed by a query, never stored

**Decision.** A user's points are read with one query every time they are needed (`PuntajeDAO.contarAportes`): +10 for each own
ACTIVO report whose validation state is VALIDADO and +2 for each vote whose `tipo_accion` matches the state of an ACTIVO report
(CONFIRMAR with VALIDADO, RECHAZAR with RECHAZADO). The tier (Crowd Baby 0-49, Explorer 50-149, Collaborator 150-299, Royalty 300
or more) is a pure function of the points (`entity/puntaje.ts`). Nothing is written when a report is created or a vote is cast,
there is no daily cap, and moderation only marks a report ELIMINADO: whatever stops being VALIDADO stops counting by itself.

**Why not the alternatives.**

- *A stored ledger or counter* (the old `puntos_karma`, updated per action) has to be kept right by hand: every state change of a
  report (a new vote, a removal) would need a compensating write for the author and for every voter, under locks, and any missed
  path leaves a wrong total forever. The read query cannot drift from the rule.
- *Crediting on events* (award when a report reaches VALIDADO, take back when it leaves it) is the same ledger with more moving
  parts: the state is derived, not stored, so there is no single moment to hook, and replays or lost events would double or drop
  points.
- *Keeping the daily caps* made the total depend on when things happened, needed a per-user lock in the report transaction, and
  the proposal has none; with points tied to validated outcomes, farming needs other users' votes, which the cap did not limit.

**Consistency.** The SQL derives each report's state with `sqlEstadoValidacion`, the twin of `estadoValidacionPorConteo`, and
takes the thresholds as parameters from `reglaEstadoValidacion(cfg)`, the only reader of the `CONFIABILIDAD_*` keys. The shared
PuntajeDAO contract runs on the in-memory DAO (the TypeScript rule) and on PostgreSQL, plus a counts test of the SQL rule at
every boundary, so the two cannot disagree.

**Cost accepted.** Each profile, login and admin page runs one aggregate query over the user's reports and votes (indexes
`ix_reporte_usuario_lugar_fecha` and `ix_validacion_usuario`); a directory page reads the points of all its users in one query.
The former point columns were first left unused (CRO-62: "se dejan de usar, no se borran"); migration 15 drops them
(D-CRO-72-COLUMNAS).

## D-CRO-72-COLUMNAS. The former point columns are dropped (migration 15, 06/11/2026)

**Decision.** Migration 15 (`database/migrations/20261106000015-retirar-columnas-karma.cjs`) drops `usuario.puntos_karma`,
`reporte_saturacion.puntos_otorgados` and `motivo_sin_puntos`, `validacion_reporte.karma_votante` and `puntos_otorgados`, and
their five CHECKs, in one transaction. It replaces the CRO-62 decision "Columnas de karma: se dejan de usar, no se borran": with
points computed by a query (D-CRO-72) nothing reads them, and keeping them meant writing a meaningless 0 on every vote.

**Accepted.** The stored values are gone for good (the CRO-62 history already comes from the query: "`puntos_karma` no se
migra"). `down` restores the columns with their type, default, NOT NULL and CHECK, holding 0 (NULL for `motivo_sin_puntos`),
not the old values.

**Deploy order.** Deploy the code of this change first, then run migration 15 right after it. Older code still reads and writes
those columns (before CRO-72 every user read maps `puntos_karma`), so migrating first breaks it. This code no longer writes
`karma_votante`, which stays NOT NULL without a default until the migration drops it, so new votes fail between the deploy and
the migration. With compose, `docker compose stop api` and then `docker compose up -d --build` (the one-shot `migrate` runs
before the new `api` starts) trades that window for a few seconds without API. A rollback goes the other way: stop the API,
undo migration 15 (`npm run db:migrate:undo`), then start the previous image.
