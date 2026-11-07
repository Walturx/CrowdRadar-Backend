/**
 * Points, tiers and uniform vote weight (CRO-72, CRO-73: S1, S4-S7, C1-C5, C7) through the public API over a REAL
 * PostgreSQL (opt-in: DATABASE_URL_TEST), with the real composition root. Every point value is read back over HTTP;
 * the SQL seeds are rows a real deployment would hold. Kept from the independent verification of CRO-72.
 */
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { tierDe } from '../../src/entity/puntaje.js';
import { URL_BD_TEST } from '../support/baseDatos.js';
import { crearEntornoPostgres, type EntornoPostgres } from '../support/entornoPostgres.js';

const PASSWORD = 'Secreta123';

describe.skipIf(!URL_BD_TEST)('puntos y tier por la API (PostgreSQL real)', () => {
  let e: EntornoPostgres;
  let jurado: number[];
  let admin: number;
  let lugarComun: number;

  beforeAll(async () => {
    e = await crearEntornoPostgres();
    jurado = [];
    for (let i = 0; i < 30; i += 1) jurado.push(await e.usuario());
    admin = await e.usuario({ rol: 'ADMIN', nombre: 'Admin' });
    lugarComun = await e.lugar();
  });

  afterAll(async () => {
    await e?.cerrar();
  });

  const perfil = async (id: number) => {
    const res = await e.get(id, '/api/users/profile');
    expect(res.status).toBe(200);
    return res.body.data.user as { puntos: number; tier: string };
  };
  const puntos = async (id: number) => (await perfil(id)).puntos;
  /** A report of `autor` with `c` CONFIRMAR and `r` RECHAZAR votes of distinct jurors, all by SQL. */
  const reporteVotado = async (autor: number, c: number, r = 0, desde = 0) => {
    const id = await e.reporteSql(autor, lugarComun);
    const votantes = jurado.filter((j) => j !== autor).slice(desde, desde + c + r);
    for (const [i, v] of votantes.entries()) await e.votoSql(v, id, i < c ? 'CONFIRMAR' : 'RECHAZAR');
    return { id, confirman: votantes.slice(0, c), rechazan: votantes.slice(c) };
  };

  it('S4 (ejemplo exacto, todo por la API): 10 reportes propios VALIDADOS + 10 votos que coinciden = 120 y CROWD_EXPLORER', async () => {
    const reg = await request(e.app)
      .post('/api/auth/register')
      .send({ nombre: 'Ana', apellido: 'Perez', email: 'ana@crowdradar.pe', password: PASSWORD, distrito: 'Miraflores' });
    expect(reg.status).toBe(201);
    const ana = reg.body.data.user.id as number;
    const autorAjeno = await e.usuario();
    // 10 own reports through POST /api/reportes (one per place: the cooldown is per user and place), each confirmed by 10 jurors through the API
    for (let i = 0; i < 10; i += 1) {
      const lugar = await e.lugar();
      const rep = await e.post(ana, '/api/reportes', { lugarId: lugar, nivel: 'MODERADO' });
      expect(rep.status).toBe(201);
      for (const j of jurado.slice(0, 10)) expect((await e.post(j, `/api/reportes/${rep.body.data.reporte.id}/validaciones`, { tipoAccion: 'CONFIRMAR' })).status).toBe(201);
    }
    // 10 reports of someone else: 9 jurors confirm and Ana's CONFIRMAR is the 10th vote (VALIDADO, so it matches)
    for (let i = 0; i < 10; i += 1) {
      const lugar = await e.lugar();
      const rep = await e.post(autorAjeno, '/api/reportes', { lugarId: lugar, nivel: 'TRANQUILO' });
      expect(rep.status).toBe(201);
      for (const j of jurado.slice(10, 19)) expect((await e.post(j, `/api/reportes/${rep.body.data.reporte.id}/validaciones`, { tipoAccion: 'CONFIRMAR' })).status).toBe(201);
      const voto = await e.post(ana, `/api/reportes/${rep.body.data.reporte.id}/validaciones`, { tipoAccion: 'CONFIRMAR' });
      expect(voto.status).toBe(201);
      expect(voto.body.data.estadoValidacion).toBe('VALIDADO');
    }
    expect(await perfil(ana)).toMatchObject({ puntos: 120, tier: 'CROWD_EXPLORER' });
    const login = await request(e.app).post('/api/auth/login').send({ email: 'ana@crowdradar.pe', password: PASSWORD });
    expect(login.status).toBe(200);
    expect(login.body.data.user).toMatchObject({ puntos: 120, tier: 'CROWD_EXPLORER' });
    expect(login.body.data.user).not.toHaveProperty('puntosKarma');
    const adminDetalle = await e.get(admin, `/api/admin/usuarios/${ana}`);
    expect(adminDetalle.body.data).toMatchObject({ puntos: 120, tier: 'CROWD_EXPLORER' });
  });

  it('S4/S12 umbrales por la API: 48/50, 148/150, 298/300 (los puntos son siempre pares; 49/149/299 solo por tierDe)', async () => {
    const casos: [number, number, string][] = [
      [4, 4, 'CROWD_BABY'], // 48
      [5, 0, 'CROWD_EXPLORER'], // 50
      [14, 4, 'CROWD_EXPLORER'], // 148
      [15, 0, 'CROWD_COLLABORATOR'], // 150
      [29, 4, 'CROWD_COLLABORATOR'], // 298
      [30, 0, 'CROWD_ROYALTY'], // 300
    ];
    for (const [reportes, votos, tier] of casos) {
      const u = await e.usuario();
      for (let i = 0; i < reportes; i += 1) await reporteVotado(u, 10);
      for (let i = 0; i < votos; i += 1) {
        const r = await reporteVotado(jurado[29]!, 9);
        await e.votoSql(u, r.id, 'CONFIRMAR');
      }
      const esperado = reportes * 10 + votos * 2;
      expect(await perfil(u), `${esperado}`).toMatchObject({ puntos: esperado, tier });
      const lista = await e.get(admin, `/api/admin/usuarios?q=Usuario&size=50`);
      expect(lista.status).toBe(200);
    }
    expect([tierDe(49), tierDe(149), tierDe(299)]).toEqual(['CROWD_BABY', 'CROWD_EXPLORER', 'CROWD_COLLABORATOR']);
  });

  it('S5: EN_VALIDACION, SIN_VALIDACIONES y ELIMINADO (por moderacion) no dan puntos a autor ni votantes', async () => {
    const autor = await e.usuario();
    await reporteVotado(autor, 9);
    await e.reporteSql(autor, lugarComun); // SIN_VALIDACIONES
    expect(await puntos(autor)).toBe(0);
    const autor2 = await e.usuario();
    const votantesFrescos: number[] = [];
    for (let i = 0; i < 10; i += 1) votantesFrescos.push(await e.usuario());
    const rep = await e.reporteSql(autor2, lugarComun);
    for (const v of votantesFrescos) await e.votoSql(v, rep, 'CONFIRMAR');
    const enVal2 = await e.reporteSql(autor2, lugarComun);
    for (const v of votantesFrescos.slice(0, 9)) await e.votoSql(v, enVal2, 'CONFIRMAR');
    expect(await puntos(autor2)).toBe(10);
    for (const v of votantesFrescos) expect(await puntos(v)).toBe(2); // the EN_VALIDACION votes add nothing
    // moderation removes it: complaint + admin ELIMINAR through the API
    const denuncia = await e.post(votantesFrescos[0]!, `/api/reportes/${rep}/denuncias`, { motivo: 'SPAM' });
    expect(denuncia.status).toBe(201);
    const res = await e.post(admin, `/api/admin/reportes-denunciados/${rep}/resolucion`, { decision: 'ELIMINAR' });
    expect(res.status).toBe(200);
    expect(await puntos(autor2)).toBe(0); // S7: -10
    for (const v of votantesFrescos) expect(await puntos(v)).toBe(0);
    const mios = await e.get(autor2, '/api/reportes/mios');
    expect(mios.body.data.items.map((i: { id: number; puntos: number }) => [i.id, i.puntos])).toEqual([
      [enVal2, 0],
      [rep, 0],
    ]);
  });

  it('S6: un voto que no coincide no suma (VALIDADO con un RECHAZAR; RECHAZADO con un CONFIRMAR)', async () => {
    const autor = await e.usuario();
    const fresh: number[] = [];
    for (let i = 0; i < 10; i += 1) fresh.push(await e.usuario());
    const validado = await e.reporteSql(autor, lugarComun);
    for (const [i, v] of fresh.entries()) await e.votoSql(v, validado, i < 9 ? 'CONFIRMAR' : 'RECHAZAR'); // 90 %
    expect(await puntos(autor)).toBe(10);
    for (const v of fresh.slice(0, 9)) expect(await puntos(v)).toBe(2);
    expect(await puntos(fresh[9]!)).toBe(0);
    const autor2 = await e.usuario();
    const fresh2: number[] = [];
    for (let i = 0; i < 10; i += 1) fresh2.push(await e.usuario());
    const rechazado = await e.reporteSql(autor2, lugarComun);
    for (const [i, v] of fresh2.entries()) await e.votoSql(v, rechazado, i === 0 ? 'CONFIRMAR' : 'RECHAZAR'); // 10 %
    expect((await e.get(autor2, `/api/reportes/mios/validacion`)).body.data.items[0].estadoValidacion).toBe('RECHAZADO');
    expect(await puntos(autor2)).toBe(0);
    expect(await puntos(fresh2[0]!)).toBe(0);
    for (const v of fresh2.slice(1)) expect(await puntos(v)).toBe(2);
  });

  it('S7: votos RECHAZAR por la API sacan el reporte de VALIDADO: el autor baja 10 y los CONFIRMAR dejan de sumar', async () => {
    const autor = await e.usuario();
    const confirman: number[] = [];
    const rechazan: number[] = [];
    for (let i = 0; i < 10; i += 1) confirman.push(await e.usuario());
    for (let i = 0; i < 16; i += 1) rechazan.push(await e.usuario());
    const lugar = await e.lugar();
    const rep = (await e.post(autor, '/api/reportes', { lugarId: lugar, nivel: 'SATURADO' })).body.data.reporte.id as number;
    for (const v of confirman) await e.post(v, `/api/reportes/${rep}/validaciones`, { tipoAccion: 'CONFIRMAR' });
    expect(await puntos(autor)).toBe(10);
    expect((await e.get(autor, '/api/reportes/mios')).body.data.items[0]).toMatchObject({ id: rep, puntos: 10 });
    for (const v of rechazan.slice(0, 5)) await e.post(v, `/api/reportes/${rep}/validaciones`, { tipoAccion: 'RECHAZAR' }); // 66.67 %
    expect(await puntos(autor)).toBe(0);
    expect((await e.get(autor, '/api/reportes/mios')).body.data.items[0]).toMatchObject({ id: rep, puntos: 0 });
    for (const v of confirman) expect(await puntos(v)).toBe(0);
    for (const v of rechazan.slice(0, 5)) expect(await puntos(v)).toBe(0);
    const ultimo = await (async () => {
      let res;
      for (const v of rechazan.slice(5)) res = await e.post(v, `/api/reportes/${rep}/validaciones`, { tipoAccion: 'RECHAZAR' }); // 10/26
      return res!;
    })();
    expect(ultimo.body.data.estadoValidacion).toBe('RECHAZADO');
    for (const v of rechazan) expect(await puntos(v)).toBe(2);
    for (const v of confirman) expect(await puntos(v)).toBe(0);
    expect(await puntos(autor)).toBe(0);
  });

  it('S1/C6: votos de usuarios con puntajes muy distintos pesan lo mismo', async () => {
    const rico = await e.usuario();
    for (let i = 0; i < 31; i += 1) await reporteVotado(rico, 10); // 310 points, Royalty
    expect(await perfil(rico)).toMatchObject({ puntos: 310, tier: 'CROWD_ROYALTY' });
    const [p1, p2] = [await e.usuario(), await e.usuario()];
    const autor = await e.usuario();
    const lugar = await e.lugar();
    const a = (await e.post(autor, '/api/reportes', { lugarId: lugar, nivel: 'MODERADO' })).body.data.reporte.id;
    await e.post(rico, `/api/reportes/${a}/validaciones`, { tipoAccion: 'CONFIRMAR' });
    await e.post(p1, `/api/reportes/${a}/validaciones`, { tipoAccion: 'RECHAZAR' });
    const ultimo = await e.post(p2, `/api/reportes/${a}/validaciones`, { tipoAccion: 'RECHAZAR' });
    expect(ultimo.body.data.confiabilidad).toMatchObject({ porcentaje: 33.33, nivel: 'BAJA', confirmaciones: 1, rechazos: 2 });
    // swapped roles give the mirror value
    const lugar2 = await e.lugar();
    const b = (await e.post(autor, '/api/reportes', { lugarId: lugar2, nivel: 'MODERADO' })).body.data.reporte.id;
    await e.post(rico, `/api/reportes/${b}/validaciones`, { tipoAccion: 'RECHAZAR' });
    await e.post(p1, `/api/reportes/${b}/validaciones`, { tipoAccion: 'CONFIRMAR' });
    const ultimoB = await e.post(p2, `/api/reportes/${b}/validaciones`, { tipoAccion: 'CONFIRMAR' });
    expect(ultimoB.body.data.confiabilidad).toMatchObject({ porcentaje: 66.67, nivel: 'MEDIA' });
  });

  describe('contrato C1-C5 y C7', () => {
    it('C1 registro/login/perfil GET y PUT: claves exactas con puntos y tier', async () => {
      const claves = ['apellido', 'distrito', 'email', 'id', 'nombre', 'puntos', 'rol', 'status', 'telefono', 'tier'];
      const reg = await request(e.app)
        .post('/api/auth/register')
        .send({ nombre: 'Luz', apellido: 'Diaz', email: 'luz@crowdradar.pe', password: PASSWORD, distrito: 'Lince' });
      expect(reg.status).toBe(201);
      expect(Object.keys(reg.body.data.user).sort()).toEqual(claves);
      expect(reg.body.data.user).toMatchObject({ puntos: 0, tier: 'CROWD_BABY' });
      const login = await request(e.app).post('/api/auth/login').send({ email: 'luz@crowdradar.pe', password: PASSWORD });
      expect(Object.keys(login.body.data.user).sort()).toEqual(claves);
      const id = reg.body.data.user.id;
      expect(Object.keys((await e.get(id, '/api/users/profile')).body.data.user).sort()).toEqual(claves);
      const put = await e.put(id, '/api/users/profile', { distrito: 'Barranco' });
      expect(put.status).toBe(200);
      expect(Object.keys(put.body.data.user).sort()).toEqual(claves);
      expect(Number.isInteger(put.body.data.user.puntos)).toBe(true);
    });

    it('C2 POST /api/reportes: data { reporte { id, lugarId, nivel, fechaHora }, saturacionLugar } sin karma', async () => {
      const u = await e.usuario();
      const res = await e.post(u, '/api/reportes', { lugarId: await e.lugar(), nivel: 'TRANQUILO' });
      expect(res.status).toBe(201);
      expect(Object.keys(res.body.data).sort()).toEqual(['reporte', 'saturacionLugar']);
      expect(Object.keys(res.body.data.reporte).sort()).toEqual(['fechaHora', 'id', 'lugarId', 'nivel']);
      expect(JSON.stringify(res.body)).not.toMatch(/karma|puntos/i);
    });

    it('C3+C7 POST validaciones: mensaje exacto y data { validacion, confiabilidad, estadoValidacion, usuario { puntos, tier } }', async () => {
      const autor = await e.usuario();
      const v = await e.usuario();
      const rep = await e.reporteSql(autor, lugarComun);
      const res = await e.post(v, `/api/reportes/${rep}/validaciones`, { tipoAccion: 'CONFIRMAR' });
      expect(res.status).toBe(201);
      expect(res.body.message).toBe('¡Gracias por validar!');
      expect(Object.keys(res.body.data).sort()).toEqual(['confiabilidad', 'estadoValidacion', 'usuario', 'validacion']);
      expect(Object.keys(res.body.data.validacion).sort()).toEqual(['fechaHora', 'id', 'reporteId', 'tipoAccion']);
      expect(Object.keys(res.body.data.confiabilidad).sort()).toEqual(['advertencia', 'confirmaciones', 'nivel', 'porcentaje', 'rechazos']);
      expect(res.body.data.estadoValidacion).toBe('EN_VALIDACION');
      expect(res.body.data.usuario).toEqual({ puntos: 0, tier: 'CROWD_BABY' });
      expect(JSON.stringify(res.body)).not.toMatch(/karma/i);
    });

    it('C7: el voto trae los puntos y el tier del votante con su propio voto incluido, iguales al perfil justo despues', async () => {
      const igualAlPerfil = async (votante: number, usuario: unknown) => {
        const { puntos: p, tier } = await perfil(votante);
        expect(usuario).toEqual({ puntos: p, tier });
      };
      // the 10th CONFIRMAR turns the report VALIDADO: the voter goes from 0 to 2 in the same answer
      const novato = await e.usuario();
      const decidido = await reporteVotado(jurado[29]!, 9);
      expect(await puntos(novato)).toBe(0);
      const primero = await e.post(novato, `/api/reportes/${decidido.id}/validaciones`, { tipoAccion: 'CONFIRMAR' });
      expect(primero.status).toBe(201);
      expect(primero.body.data.estadoValidacion).toBe('VALIDADO');
      expect(primero.body.data.usuario).toEqual({ puntos: 2, tier: 'CROWD_BABY' });
      await igualAlPerfil(novato, primero.body.data.usuario);
      // 48 points (4 own VALIDADO reports + 4 matching votes) and a 10th CONFIRMAR: 50 and the new tier
      const cerca = await e.usuario();
      for (let i = 0; i < 4; i += 1) await reporteVotado(cerca, 10);
      for (let i = 0; i < 4; i += 1) await e.votoSql(cerca, (await reporteVotado(jurado[29]!, 9)).id, 'CONFIRMAR');
      expect(await perfil(cerca)).toMatchObject({ puntos: 48, tier: 'CROWD_BABY' });
      const cruce = await e.post(cerca, `/api/reportes/${(await reporteVotado(jurado[29]!, 9)).id}/validaciones`, { tipoAccion: 'CONFIRMAR' });
      expect(cruce.body.data.usuario).toEqual({ puntos: 50, tier: 'CROWD_EXPLORER' });
      await igualAlPerfil(cerca, cruce.body.data.usuario);
      // a vote that leaves the report undecided returns what the voter already had
      const pendiente = await e.post(cerca, `/api/reportes/${await e.reporteSql(jurado[29]!, lugarComun)}/validaciones`, { tipoAccion: 'RECHAZAR' });
      expect(pendiente.body.data.estadoValidacion).toBe('EN_VALIDACION');
      expect(pendiente.body.data.usuario).toEqual({ puntos: 50, tier: 'CROWD_EXPLORER' });
      await igualAlPerfil(cerca, pendiente.body.data.usuario);
    });

    it('C4 GET /api/reportes/mios: claves exactas, puntos 10 o 0', async () => {
      const autor = await e.usuario();
      const r = await reporteVotado(autor, 10);
      const r2 = await e.reporteSql(autor, lugarComun);
      const res = await e.get(autor, '/api/reportes/mios');
      expect(res.status).toBe(200);
      for (const item of res.body.data.items) expect(Object.keys(item).sort()).toEqual(['estado', 'fechaHora', 'id', 'lugar', 'nivel', 'puntos']);
      const porId = Object.fromEntries(res.body.data.items.map((i: { id: number; puntos: number }) => [i.id, i.puntos]));
      expect(porId).toEqual({ [r.id]: 10, [r2]: 0 });
    });

    it('C5 admin: claves exactas, orden=KARMA 400 VALIDACION_FALLIDA, RECIENTES y NOMBRE responden', async () => {
      const lista = await e.get(admin, '/api/admin/usuarios?size=50');
      expect(lista.status).toBe(200);
      for (const item of lista.body.data.items) {
        expect(Object.keys(item).sort()).toEqual(['apellido', 'email', 'id', 'nombre', 'puntos', 'rol', 'sancionVigente', 'status', 'tier']);
      }
      const det = await e.get(admin, `/api/admin/usuarios/${jurado[0]}`);
      expect(Object.keys(det.body.data).sort()).toEqual(
        ['apellido', 'email', 'id', 'nombre', 'puntos', 'reportesDenunciados', 'reportesPublicados', 'rol', 'sancionVigente', 'status', 'tier'],
      );
      const retirado = await e.get(admin, '/api/admin/usuarios?orden=KARMA');
      expect([retirado.status, retirado.body.code]).toEqual([400, 'VALIDACION_FALLIDA']);
      expect((await e.get(admin, '/api/admin/usuarios?orden=RECIENTES')).status).toBe(200);
      expect((await e.get(admin, '/api/admin/usuarios?orden=NOMBRE')).status).toBe(200);
    });
  });
});
