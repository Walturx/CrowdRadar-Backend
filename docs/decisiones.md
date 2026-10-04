# Design decisions

Short notes on decisions a reader of the code might question. Each says what was decided, why, and what is accepted.

## D1. Event delivery: at-most-once after the commit, no outbox (accepted for the MVP)

**Decision.** `ReporteFacadeImpl.registrar` commits the transaction (report, karma and place saturation) and only then
publishes `SaturacionCambiadaEvento` on the `SaturacionSubject`. The answer waits for the publication at most
`EVENTOS_PRESUPUESTO_MS` (500 ms); past that it goes out anyway and the delivery finishes in the background. Every subscriber
fails in isolation (logged, never rethrown). There is no outbox and no persistent queue.

**Guarantee.** Delivery is **at-most-once**: if the process dies between the commit and the publication (or during it), the
event is lost and is not retried. The report, the karma and the place saturation are **never** lost: they share the transaction.

**Why the MVP accepts it.**

- The in-app alert is a convenience notice: the map and the place detail read the current saturation from `lugar`, so a lost
  event only delays one notice, it never leaves wrong data behind.
- Publishing before the commit would be worse (notices about changes that are later rolled back) and an outbox adds a table, a
  worker and their operation, which is out of proportion for the scope of the course.

**How to reconcile if it is ever needed.** `lugar.saturacion_actualizada_en` stores the instant of the last recomputation of
each place. A reconciliation job can compare it with the date of the latest alert generated for the place (`alerta.fecha_hora`)
and publish the missing change again. If the product needs guaranteed delivery, the next step is a transactional outbox (a
`evento_pendiente` table written in the same transaction and drained by a worker); the `SaturacionSubject` contract does not change.

## D2. Report serialization: per user and place, per place, per user

Three locks inside the same transaction, always in this order (no cycle is possible):

1. `pg_advisory_xact_lock(usuarioId, lugarId)` at the cooldown check: two simultaneous reports of one user on one place run one
   after the other (the second one sees the first row and gets 422).
2. `SELECT ... FOR UPDATE` on the `lugar` row (`LugarDAO.buscarPorIdParaActualizar`): reports of different users on the same
   place recompute the saturation one after the other, so the final level and the published changes reflect all of them.
3. `pg_advisory_xact_lock(usuarioId, 0)` before counting the rewarded reports of the day: the daily karma cap cannot be exceeded
   by reporting on several places at once. The second key 0 never collides with lock 1 because no place has id 0.

`DB_LOCK_TIMEOUT_MS` bounds the wait for a lock; a deadlock, a serialization failure or that timeout answer `503
SERVICIO_NO_DISPONIBLE` with `Retry-After`, and the client may send the request again.
