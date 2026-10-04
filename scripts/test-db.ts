/**
 * `npm run test:db`: runs the whole suite INCLUDING the database-backed tests.
 *
 * Those tests are opt-in (`describe.skipIf(!DATABASE_URL_TEST)`), which is convenient locally but
 * would let CI go green with every one of them skipped. This command refuses to run without the
 * variable, so a CI job that must exercise the database cannot silently skip it.
 */
import { spawn } from 'node:child_process';

const url = process.env.DATABASE_URL_TEST;

if (!url) {
  process.stderr.write(
    [
      'test:db requiere DATABASE_URL_TEST (una base de datos descartable; las pruebas crean y borran bases temporales).',
      'Ejemplo: DATABASE_URL_TEST=postgres://crowdradar:<password>@localhost:5432/crowdradar_test npm run test:db',
      '',
    ].join('\n'),
  );
  process.exit(1);
}

const hijo = spawn(process.execPath, ['node_modules/vitest/vitest.mjs', 'run'], { stdio: 'inherit', env: process.env });
hijo.on('exit', (codigo) => process.exit(codigo ?? 1));
