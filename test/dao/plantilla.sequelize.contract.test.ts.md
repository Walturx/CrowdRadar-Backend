# Template: run a DAO contract against your Sequelize implementation

This file is documentation, not a test (the `.md` suffix keeps vitest from loading it). Copy the snippet into
`test/dao/<Nombre>DAOSequelize.contract.test.ts` when you implement a DAO port.

## Steps

1. Implement `src/dao/impl/sequelize/<Nombre>DAOSequelize.ts` and register your model in
   `src/dao/impl/sequelize/model/initModels.ts`.
2. The contract function already exists: `test/dao/<Nombre>DAO.contract.ts` (the in-memory fake passes it today).
   Do not copy its cases; call it.
3. If the contract needs seeded rows (foreign keys), pass a `Sembrador` that INSERTS real rows. The in-memory one
   only hands out ids; a database enforces the FKs (`usuario`, `lugar`, `lugar_favorito`, ...).
4. Add the file below, run `DATABASE_URL_TEST=postgres://... npm run test:db`, and make every case pass without
   editing the contract. A case you think is wrong goes through a contract PR (see `docs/contratos-streams.md`).

## Snippet

```ts
import { <Nombre>DAOSequelize } from '../../src/dao/impl/sequelize/<Nombre>DAOSequelize.js';
import { crearSembradorSequelize } from '../support/dao/sequelize/SembradorSequelize.js'; // you write this
import { contrato<Nombre>DAO } from './<Nombre>DAO.contract.js';
import { ejecutarContratoDAO } from './ejecutarContratoDAO.js';

ejecutarContratoDAO({
  titulo: '<Nombre>DAOSequelize (PostgreSQL)',
  contrato: contrato<Nombre>DAO,
  crearEntorno: (sequelize) => ({
    dao: new <Nombre>DAOSequelize(),
    sembrador: crearSembradorSequelize(sequelize),
  }),
});
```

## What the runner gives you

- `describe.skipIf(!DATABASE_URL_TEST)`: `npm test` stays database-free; `npm run test:db` fails without the URL.
- A throwaway database created, migrated with `db:migrate` and dropped afterwards, shared by the cases of the block.
- Models initialised through `initModels`, so your DAO can use them directly.

## Contract notes worth knowing

- Pagination: order by the sort key and then `id` (`ORDER BY fecha_hora DESC, id DESC`) so ties page deterministically.
- A foreign-key violation must surface as Sequelize's `ForeignKeyConstraintError` (do not swallow or remap it in the DAO).
- A unique violation the port documents (`ConflictoException`, `EmailYaRegistradoException`) must be mapped by the DAO.
- Deleting a favourite cascades to its alerts in the database; the in-memory fake mirrors that.
