/** White-box tests of the reliability strategies and of the derived estadoValidacion (spec M5 R2, S5-S7). */
import { describe, expect, it } from 'vitest';
import { NivelConfiabilidad } from '../../src/enum/NivelConfiabilidad.js';
import { EstadoValidacion } from '../../src/enum/EstadoValidacion.js';
import { TipoAccionValidacion } from '../../src/enum/TipoAccionValidacion.js';
import type { VotoConfiabilidad } from '../../src/pattern/strategy/confiabilidad/EstrategiaConfiabilidad.js';
import { derivarEstadoValidacion } from '../../src/pattern/strategy/confiabilidad/derivarEstadoValidacion.js';
import { ConfiabilidadPonderadaKarmaStrategy } from '../../src/pattern/strategy/confiabilidad/impl/ConfiabilidadPonderadaKarmaStrategy.js';
import { ConfiabilidadSimpleStrategy } from '../../src/pattern/strategy/confiabilidad/impl/ConfiabilidadSimpleStrategy.js';

const OPCIONES = { minVotos: 3, umbralAlta: 70, umbralMedia: 40, topeKarmaPeso: 500 };
const C = TipoAccionValidacion.CONFIRMAR;
const R = TipoAccionValidacion.RECHAZAR;

const voto = (tipoAccion: TipoAccionValidacion, karmaVotante = 0): VotoConfiabilidad => ({ tipoAccion, karmaVotante });
const repetir = (n: number, tipo: TipoAccionValidacion, karma = 0) => Array.from({ length: n }, () => voto(tipo, karma));

describe('ConfiabilidadPonderadaKarmaStrategy.calcular', () => {
  const estrategia = new ConfiabilidadPonderadaKarmaStrategy(OPCIONES);

  it('sin votos es INSUFICIENTE y no tiene porcentaje', () => {
    expect(estrategia.calcular([])).toEqual({ nivel: NivelConfiabilidad.INSUFICIENTE, porcentaje: null, votos: 0 });
  });

  it('con menos votos que el minimo es INSUFICIENTE aunque todos confirmen', () => {
    expect(estrategia.calcular(repetir(2, C, 900))).toEqual({
      nivel: NivelConfiabilidad.INSUFICIENTE,
      porcentaje: null,
      votos: 2,
    });
  });

  it('exactamente el minimo de votos ya calcula', () => {
    expect(estrategia.calcular(repetir(3, C)).nivel).toBe(NivelConfiabilidad.ALTA);
  });

  it('karma 0 pesa 1: 5 confirman y 8 rechazan dan 38.46 BAJA', () => {
    expect(estrategia.calcular([...repetir(5, C), ...repetir(8, R)])).toEqual({
      nivel: NivelConfiabilidad.BAJA,
      porcentaje: 38.46,
      votos: 13,
    });
  });

  it('18 confirman y 3 rechazan dan 85.71 ALTA', () => {
    expect(estrategia.calcular([...repetir(18, C), ...repetir(3, R)])).toMatchObject({
      nivel: NivelConfiabilidad.ALTA,
      porcentaje: 85.71,
    });
  });

  it('el karma pesa mas: un voto con karma 100 vale 2', () => {
    // 2 confirmaciones (peso 1 cada una) contra 1 rechazo de karma 100 (peso 2): 2 de 4 = 50
    expect(estrategia.calcular([voto(C), voto(C), voto(R, 100)])).toMatchObject({
      porcentaje: 50,
      nivel: NivelConfiabilidad.MEDIA,
    });
  });

  it('el peso se topa en karma 500 (peso 6): 900 pesa lo mismo que 500', () => {
    const conTope = estrategia.calcular([voto(C, 900), voto(R), voto(R), voto(R)]);
    const justo = estrategia.calcular([voto(C, 500), voto(R), voto(R), voto(R)]);
    expect(conTope.porcentaje).toBe(66.67); // 6 / 9
    expect(conTope).toEqual(justo);
  });

  it('un karma negativo no resta peso (se trata como 0)', () => {
    expect(estrategia.calcular([voto(C, -50), voto(C), voto(C)]).porcentaje).toBe(100);
  });

  it('el borde 70 es ALTA y 69.99 es MEDIA', () => {
    // 7 de 10 = 70
    expect(estrategia.calcular([...repetir(7, C), ...repetir(3, R)])).toMatchObject({ porcentaje: 70, nivel: 'ALTA' });
    // 69.57 = 16 de 23
    expect(estrategia.calcular([...repetir(16, C), ...repetir(7, R)])).toMatchObject({ porcentaje: 69.57, nivel: 'MEDIA' });
  });

  it('el borde 40 es MEDIA y 39.99 es BAJA', () => {
    // 2 de 5 = 40
    expect(estrategia.calcular([...repetir(2, C), ...repetir(3, R)])).toMatchObject({ porcentaje: 40, nivel: 'MEDIA' });
    // 9 de 23 = 39.13
    expect(estrategia.calcular([...repetir(9, C), ...repetir(14, R)])).toMatchObject({ porcentaje: 39.13, nivel: 'BAJA' });
  });

  it('todos confirman es 100 ALTA y todos rechazan es 0 BAJA', () => {
    expect(estrategia.calcular(repetir(4, C))).toMatchObject({ porcentaje: 100, nivel: 'ALTA' });
    expect(estrategia.calcular(repetir(4, R))).toMatchObject({ porcentaje: 0, nivel: 'BAJA' });
  });

  it('clasifica con el porcentaje redondeado que devuelve (66.666 se devuelve 66.67 y alcanza el umbral 66.67)', () => {
    const afinada = new ConfiabilidadPonderadaKarmaStrategy({ ...OPCIONES, umbralAlta: 66.67 });
    expect(afinada.calcular([voto(C, 500), voto(R), voto(R), voto(R)])).toMatchObject({ porcentaje: 66.67, nivel: 'ALTA' });
  });

  it('respeta los umbrales y el minimo configurados', () => {
    const estricta = new ConfiabilidadPonderadaKarmaStrategy({ minVotos: 5, umbralAlta: 90, umbralMedia: 60, topeKarmaPeso: 0 });
    expect(estricta.calcular(repetir(4, C)).nivel).toBe(NivelConfiabilidad.INSUFICIENTE);
    expect(estricta.calcular([...repetir(8, C), ...repetir(2, R)])).toMatchObject({ nivel: 'MEDIA' });
    // tope 0: el karma no pesa
    expect(estricta.calcular([voto(C, 900), ...repetir(4, R)]).porcentaje).toBe(20);
  });
});

describe('ConfiabilidadSimpleStrategy.calcular', () => {
  const estrategia = new ConfiabilidadSimpleStrategy(OPCIONES);

  it('ignora el karma: cada voto pesa 1', () => {
    expect(estrategia.calcular([voto(C, 900), voto(R), voto(R), voto(R)])).toMatchObject({ porcentaje: 25, nivel: 'BAJA' });
  });

  it('tambien devuelve INSUFICIENTE bajo el minimo', () => {
    expect(estrategia.calcular([voto(C), voto(R)])).toEqual({ nivel: 'INSUFICIENTE', porcentaje: null, votos: 2 });
  });
});

describe('derivarEstadoValidacion', () => {
  const estrategia = new ConfiabilidadPonderadaKarmaStrategy(OPCIONES);
  const estado = (confirman: number, rechazan: number, minVotosEstado = 10) =>
    derivarEstadoValidacion(estrategia.calcular([...repetir(confirman, C), ...repetir(rechazan, R)]), minVotosEstado);

  it('sin votos es SIN_VALIDACIONES', () => {
    expect(estado(0, 0)).toBe(EstadoValidacion.SIN_VALIDACIONES);
  });
  it('12 confirman y 1 rechaza es VALIDADO', () => {
    expect(estado(12, 1)).toBe(EstadoValidacion.VALIDADO);
  });
  it('4 confirman y 1 rechaza sigue EN_VALIDACION (pocos votos)', () => {
    expect(estado(4, 1)).toBe(EstadoValidacion.EN_VALIDACION);
  });
  it('2 confirman y 9 rechazan es RECHAZADO', () => {
    expect(estado(2, 9)).toBe(EstadoValidacion.RECHAZADO);
  });
  it('el borde: 9 votos todavia EN_VALIDACION y 10 ya VALIDADO', () => {
    expect(estado(9, 0)).toBe(EstadoValidacion.EN_VALIDACION);
    expect(estado(10, 0)).toBe(EstadoValidacion.VALIDADO);
    expect(estado(0, 9)).toBe(EstadoValidacion.EN_VALIDACION);
    expect(estado(0, 10)).toBe(EstadoValidacion.RECHAZADO);
  });
  it('con muchos votos y confiabilidad MEDIA sigue EN_VALIDACION', () => {
    expect(estado(5, 5)).toBe(EstadoValidacion.EN_VALIDACION);
  });
  it('respeta el minimo configurado', () => {
    expect(estado(4, 0, 4)).toBe(EstadoValidacion.VALIDADO);
  });
});
