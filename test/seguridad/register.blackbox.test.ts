/**
 * Integrante: stream M1 (seguridad de cuenta)
 * Tecnica: caja negra, particiones de equivalencia + analisis de valores limite
 * Metodo: POST /api/auth/register (spec M1 R5, R11; HU 1.2), 6 entradas: nombre, apellido, email, password, telefono, distrito
 *   - nombre y apellido: texto recortado de 2 a 80 caracteres | 1 y 81 invalidos (limites 1/2 y 80/81) | solo espacios | ausente
 *   - email: formato valido hasta 120 caracteres (120 valido, 121 invalido) | sin arroba | dominio reservado de datos sinteticos | ausente
 *   - password: 8 a 64 caracteres con mayuscula y digito (7/8 y 64/65 de limite) | sin mayuscula | sin digito |
 *     <= 64 caracteres pero > 72 bytes (multibyte) | ausente
 *   - telefono: ^9\d{8}$ valido | "" u omitido (queda en null) | 8 y 10 digitos | no empieza con 9 | con letras
 *   - distrito: 2 a 60 caracteres (limites 1/2 y 60/61) | "" u omitido (queda en null)
 *   - ademas: un campo desconocido (rol) se rechaza y no crea la cuenta
 * Cada caso invalido debe responder 400 VALIDACION_FALLIDA nombrando el campo, sin crear la cuenta.
 */
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { crearContenedorPrueba, type ContenedorPrueba } from '../support/crearContenedorPrueba.js';

const VALIDO = {
  nombre: 'Ana',
  apellido: 'Ruiz',
  email: 'ana.ruiz@crowdradar.pe',
  password: 'Secreta123',
  telefono: '987654321',
  distrito: 'Miraflores',
};
type Cuerpo = Record<string, unknown>;

describe('POST /api/auth/register (caja negra, 6 entradas)', () => {
  let ctx: ContenedorPrueba;
  let app: ReturnType<typeof createApp>;

  const registrar = (cambios: Cuerpo = {}) => request(app).post('/api/auth/register').send({ ...VALIDO, ...cambios });
  const sin = (campo: string): Cuerpo => {
    const cuerpo: Cuerpo = { ...VALIDO };
    delete cuerpo[campo];
    return cuerpo;
  };
  const camposInvalidos = (res: request.Response): string[] => res.body.errors.map((e: { campo: string }) => e.campo);

  beforeEach(() => {
    ctx = crearContenedorPrueba({ cfg: { LIMITE_REGISTRO: 1000 } });
    app = createApp(ctx.contenedor);
  });

  const aceptado = async (cambios: Cuerpo) => {
    const res = await registrar(cambios);
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    return res;
  };
  const rechazado = async (campo: string, cuerpo: Cuerpo) => {
    const res = await request(app).post('/api/auth/register').send(cuerpo);
    expect(res.status, JSON.stringify(res.body)).toBe(400);
    expect(res.body.code).toBe('VALIDACION_FALLIDA');
    expect(camposInvalidos(res)).toContain(campo);
    expect(await ctx.usuarioDAO.buscarPorEmail(String(cuerpo.email ?? VALIDO.email))).toBeNull();
  };

  it('todas las entradas validas: 201 y la cuenta queda guardada', async () => {
    const res = await aceptado({});
    expect(res.body.data.user).toMatchObject({ nombre: 'Ana', apellido: 'Ruiz', email: VALIDO.email, telefono: '987654321', distrito: 'Miraflores' });
  });

  describe.each(['nombre', 'apellido'])('%s', (campo) => {
    it.each([
      ['2 caracteres (limite inferior valido)', 'Li'],
      ['80 caracteres (limite superior valido)', 'N'.repeat(80)],
      ['con espacios alrededor (se recorta)', '  Ana  '],
    ])('acepta %s', async (_caso, valor) => {
      await aceptado({ [campo]: valor });
    });

    it.each([
      ['1 caracter (bajo el limite)', 'A'],
      ['81 caracteres (sobre el limite)', 'N'.repeat(81)],
      ['solo espacios', '   '],
      ['vacio', ''],
      ['no es texto', 12345],
    ])('rechaza %s', async (_caso, valor) => {
      await rechazado(campo, { ...VALIDO, [campo]: valor });
    });

    it('rechaza el campo ausente', async () => {
      await rechazado(campo, sin(campo));
    });
  });

  describe('email', () => {
    it('acepta mayusculas y espacios: se guarda recortado y en minusculas', async () => {
      const res = await aceptado({ email: '  ANA.Ruiz@CrowdRadar.PE ' });
      expect(res.body.data.user.email).toBe('ana.ruiz@crowdradar.pe');
    });

    it('acepta 120 caracteres (limite superior valido)', async () => {
      await aceptado({ email: `${'a'.repeat(120 - '@crowdradar.pe'.length)}@crowdradar.pe` });
    });

    it.each([
      ['121 caracteres (sobre el limite)', `${'a'.repeat(121 - '@crowdradar.pe'.length)}@crowdradar.pe`],
      ['sin arroba', 'ana.ruiz.crowdradar.pe'],
      ['sin dominio', 'ana@'],
      ['dominio reservado de datos sinteticos', 'demo1@sintetico.crowdradar.local'],
      ['vacio', ''],
    ])('rechaza %s', async (_caso, email) => {
      await rechazado('email', { ...VALIDO, email });
    });

    it('rechaza el campo ausente', async () => {
      await rechazado('email', sin('email'));
    });
  });

  describe('password (politica unica R5)', () => {
    it.each([
      ['8 caracteres (limite inferior valido)', 'Abcdefg1'],
      ['64 caracteres (limite superior valido)', `A1${'a'.repeat(62)}`],
      ['mayuscula acentuada y digito', 'Ñandu12345'],
    ])('acepta %s', async (_caso, password) => {
      await aceptado({ password });
    });

    it.each([
      ['7 caracteres (bajo el limite)', 'Abcdef1'],
      ['65 caracteres (sobre el limite)', `A1${'a'.repeat(63)}`],
      ['sin mayuscula', 'abcdefg12'],
      ['sin digito', 'Abcdefghi'],
      ['<= 64 caracteres pero > 72 bytes (multibyte)', `A1${'ñ'.repeat(40)}`],
      ['vacia', ''],
    ])('rechaza %s', async (_caso, password) => {
      await rechazado('password', { ...VALIDO, password });
    });

    it('cada requisito incumplido es un error aparte (HU 2.2 c3)', async () => {
      const res = await registrar({ password: 'abc' });
      expect(camposInvalidos(res).filter((c) => c === 'password')).toHaveLength(3);
    });

    it('rechaza el campo ausente', async () => {
      await rechazado('password', sin('password'));
    });
  });

  describe('telefono', () => {
    it.each([
      ['9 digitos que empiezan con 9', '912345678', '912345678'],
      ['cadena vacia', '', null],
      ['con espacios (se recorta a vacio)', '   ', null],
    ])('acepta %s', async (_caso, telefono, guardado) => {
      const res = await aceptado({ telefono });
      expect(res.body.data.user.telefono).toBe(guardado);
    });

    it('omitido queda en null', async () => {
      const res = await request(app).post('/api/auth/register').send(sin('telefono'));
      expect(res.status).toBe(201);
      expect(res.body.data.user.telefono).toBeNull();
    });

    it.each([
      ['8 digitos (bajo el limite)', '98765432'],
      ['10 digitos (sobre el limite)', '9876543210'],
      ['no empieza con 9', '887654321'],
      ['con letras', '98765432a'],
      ['con prefijo de pais', '+51987654321'],
    ])('rechaza %s', async (_caso, telefono) => {
      await rechazado('telefono', { ...VALIDO, telefono });
    });
  });

  describe('distrito', () => {
    it.each([
      ['2 caracteres (limite inferior valido)', 'Ate', 'Ate'],
      ['60 caracteres (limite superior valido)', 'D'.repeat(60), 'D'.repeat(60)],
      ['cadena vacia', '', null],
    ])('acepta %s', async (_caso, distrito, guardado) => {
      const res = await aceptado({ distrito });
      expect(res.body.data.user.distrito).toBe(guardado);
    });

    it('omitido queda en null', async () => {
      const res = await request(app).post('/api/auth/register').send(sin('distrito'));
      expect(res.status).toBe(201);
      expect(res.body.data.user.distrito).toBeNull();
    });

    it.each([
      ['1 caracter (bajo el limite)', 'A'],
      ['61 caracteres (sobre el limite)', 'D'.repeat(61)],
    ])('rechaza %s', async (_caso, distrito) => {
      await rechazado('distrito', { ...VALIDO, distrito });
    });
  });

  it('un campo desconocido (rol) se rechaza y no crea la cuenta', async () => {
    await rechazado('rol', { ...VALIDO, rol: 'ADMIN' });
  });
});
