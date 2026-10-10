/** Dockerfile hygiene: the image only starts the server; migrations run in a separate one-shot step (R1-404, R4-415). */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const RAIZ = resolve(import.meta.dirname, '..', '..');
const dockerfile = readFileSync(resolve(RAIZ, 'Dockerfile'), 'utf8');

describe('Dockerfile', () => {
  it('el comando por defecto solo arranca el servidor (sin migrar)', () => {
    expect(dockerfile).toMatch(/^CMD \["node", "dist\/server\.js"\]/m);
    expect(dockerfile).not.toMatch(/^CMD.*db:migrate/m);
  });

  it('el comentario de sequelize-cli describe el flujo real: lo usa el servicio migrate, no el arranque del api', () => {
    expect(dockerfile).toContain('sequelize-cli');
    expect(dockerfile).toContain('one-shot');
    expect(dockerfile).not.toMatch(/container runs the migrations at start-up/i);
  });

  it('corre como usuario no root', () => {
    expect(dockerfile).toMatch(/^USER node/m);
  });

  it('la etapa build copia scripts/ antes de npm run build (copiar-vistas.mjs)', () => {
    const copia = dockerfile.search(/^COPY scripts \.\/scripts$/m);
    const build = dockerfile.search(/^RUN npm run build$/m);
    expect(copia).toBeGreaterThanOrEqual(0);
    expect(build).toBeGreaterThan(copia);
  });
});
