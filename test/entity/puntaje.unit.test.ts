/** Points and tier (CRO-72): one definition of the point values and of the four tier thresholds. */
import { describe, expect, it } from 'vitest';
import { PUNTOS_POR_REPORTE_VALIDADO, PUNTOS_POR_VOTO_ACERTADO, puntajeDe, tierDe, UMBRALES_TIER } from '../../src/entity/puntaje.js';
import { Tier } from '../../src/enum/Tier.js';

describe('tierDe', () => {
  it.each([
    [0, Tier.CROWD_BABY],
    [49, Tier.CROWD_BABY],
    [50, Tier.CROWD_EXPLORER],
    [149, Tier.CROWD_EXPLORER],
    [150, Tier.CROWD_COLLABORATOR],
    [299, Tier.CROWD_COLLABORATOR],
    [300, Tier.CROWD_ROYALTY],
    [10_000, Tier.CROWD_ROYALTY],
  ])('%s puntos -> %s (cada umbral es inclusivo hacia arriba)', (puntos, tier) => {
    expect(tierDe(puntos)).toBe(tier);
  });

  it('los umbrales son Crowd Baby 0, Explorer 50, Collaborator 150 y Royalty 300, y cubren los cuatro tiers', () => {
    expect(UMBRALES_TIER).toEqual([
      { tier: Tier.CROWD_BABY, desde: 0 },
      { tier: Tier.CROWD_EXPLORER, desde: 50 },
      { tier: Tier.CROWD_COLLABORATOR, desde: 150 },
      { tier: Tier.CROWD_ROYALTY, desde: 300 },
    ]);
    expect(UMBRALES_TIER.map((u) => u.tier).sort()).toEqual(Object.values(Tier).sort());
  });

  it('los valores del enum son los del contrato', () => {
    expect(Object.values(Tier).sort()).toEqual(['CROWD_BABY', 'CROWD_COLLABORATOR', 'CROWD_EXPLORER', 'CROWD_ROYALTY']);
  });
});

describe('puntajeDe', () => {
  it('+10 por reporte validado y +2 por voto acertado', () => {
    expect(PUNTOS_POR_REPORTE_VALIDADO).toBe(10);
    expect(PUNTOS_POR_VOTO_ACERTADO).toBe(2);
    expect(puntajeDe({ reportesValidados: 10, votosAcertados: 10 })).toEqual({ puntos: 120, tier: Tier.CROWD_EXPLORER });
  });

  it('sin aportes es 0 y Crowd Baby', () => {
    expect(puntajeDe({ reportesValidados: 0, votosAcertados: 0 })).toEqual({ puntos: 0, tier: Tier.CROWD_BABY });
  });
});
