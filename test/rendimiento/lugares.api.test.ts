import { performance } from 'node:perf_hooks';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { createApp } from '../../src/app.js';
import { Rol } from '../../src/enum/Rol.js';
import { crearContenedorPrueba } from '../support/crearContenedorPrueba.js';
import { aUsuario } from '../support/fabrica/datos.js';

describe('CRO-84: rendimiento de la API', () => {
  it('PERF-API-01: mide la latencia de consulta de lugares', async () => {
    const ctx = crearContenedorPrueba();
    const app = createApp(ctx.contenedor);

    const usuario = ctx.usuarioDAO.agregar(
      aUsuario({
        rol: Rol.USUARIO,
        email: 'rendimiento@crowdradar.pe',
      }),
    );

    const token = ctx.emisorToken.emitir(usuario).token;
    const tiempos: number[] = [];
    const repeticiones = 20;

    for (let i = 0; i < repeticiones; i++) {
      const inicio = performance.now();

      const respuesta = await request(app)
        .get('/api/lugares?bbox=-77.15,-12.25,-76.85,-11.9')
        .set('Authorization', `Bearer ${token}`);

      const duracion = performance.now() - inicio;

      expect(respuesta.status).toBe(200);
      tiempos.push(duracion);
    }

    tiempos.sort((a, b) => a - b);

    const promedio =
      tiempos.reduce((total, valor) => total + valor, 0) /
      tiempos.length;

    const p95 = tiempos[Math.ceil(repeticiones * 0.95) - 1];

    console.log(`PERF-API-01: ${repeticiones} solicitudes`);
    console.log(`Latencia promedio: ${promedio.toFixed(2)} ms`);
    console.log(`Latencia p95: ${p95.toFixed(2)} ms`);

    expect(tiempos).toHaveLength(repeticiones);
    expect(promedio).toBeGreaterThan(0);
  });


it('PERF-API-02: mide 20 consultas concurrentes', async () => {
  const ctx = crearContenedorPrueba();
  const app = createApp(ctx.contenedor);

  const usuario = ctx.usuarioDAO.agregar(
    aUsuario({
      rol: Rol.USUARIO,
      email: 'concurrencia@crowdradar.pe',
    }),
  );

  const token = ctx.emisorToken.emitir(usuario).token;
  const cantidad = 20;

  const inicio = performance.now();

  const respuestas = await Promise.all(
    Array.from({ length: cantidad }, () =>
      request(app)
        .get('/api/lugares?bbox=-77.15,-12.25,-76.85,-11.9')
        .set('Authorization', `Bearer ${token}`),
    ),
  );

  const duracion = performance.now() - inicio;

  for (const respuesta of respuestas) {
    expect(respuesta.status).toBe(200);
  }

  console.log(`PERF-API-02: ${cantidad} solicitudes concurrentes`);
  console.log(`Tiempo total: ${duracion.toFixed(2)} ms`);
  console.log(
    `Solicitudes por segundo aproximadas: ${(
      cantidad / (duracion / 1000)
    ).toFixed(2)}`,
  );

  expect(respuestas).toHaveLength(cantidad);
});


});
