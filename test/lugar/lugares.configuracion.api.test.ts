/**
 * The bounds of GET /api/lugares come from ConfiguracionApp (LUGARES_Q_MIN, LUGARES_Q_MAX, LUGARES_LIMITE_MAX,
 * LUGARES_LIMITE_DEFAULT), not from constants in the DTO. Review R2-904.
 */
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { crearContenedorPrueba } from '../support/crearContenedorPrueba.js';
import { aUsuario } from '../support/fabrica/datos.js';

const ctx = crearContenedorPrueba({
  cfg: { LUGARES_Q_MIN: 3, LUGARES_Q_MAX: 8, LUGARES_LIMITE_MAX: 5, LUGARES_LIMITE_DEFAULT: 4 },
});
const app = createApp(ctx.contenedor);
const usuario = ctx.usuarioDAO.agregar(aUsuario({ email: 'cfg@crowdradar.pe' }));
const TOKEN = `Bearer ${ctx.emisorToken.emitir(usuario).token}`;
for (let i = 0; i < 8; i += 1) ctx.lugarDAO.agregar({ nombre: `Parque ${i}` });

const buscar = (query: Record<string, string | number>) => request(app).get('/api/lugares').query(query).set('Authorization', TOKEN);
const camposInvalidos = (res: request.Response) => (res.body.errors as { campo: string }[] | undefined)?.map((e) => e.campo) ?? [];

describe('GET /api/lugares con limites configurados', () => {
  it('q respeta LUGARES_Q_MIN y LUGARES_Q_MAX', async () => {
    expect((await buscar({ q: 'pa' })).status).toBe(400);
    expect((await buscar({ q: 'par' })).status).toBe(200);
    expect((await buscar({ q: 'parque 1' })).status).toBe(200);
    const larga = await buscar({ q: 'parque 12' });
    expect(larga.status).toBe(400);
    expect(camposInvalidos(larga)).toContain('q');
  });

  it('limite respeta LUGARES_LIMITE_MAX', async () => {
    expect((await buscar({ q: 'par', limite: 5 })).status).toBe(200);
    const res = await buscar({ q: 'par', limite: 6 });
    expect(res.status).toBe(400);
    expect(camposInvalidos(res)).toContain('limite');
  });

  it('sin limite se aplica LUGARES_LIMITE_DEFAULT', async () => {
    const res = await buscar({ q: 'par' });
    expect(res.body.data.items).toHaveLength(4);
  });
});
