/**
 * Districts a user may pick: the 43 of Metropolitan Lima and the 7 of Callao, with their official names.
 * The app shows this same list in a dropdown, so both sides accept exactly these values.
 */
export const DISTRITOS_LIMA = [
  'Ancón',
  'Ate',
  'Barranco',
  'Breña',
  'Carabayllo',
  'Chaclacayo',
  'Chorrillos',
  'Cieneguilla',
  'Comas',
  'El Agustino',
  'Independencia',
  'Jesús María',
  'La Molina',
  'La Victoria',
  'Lima',
  'Lince',
  'Los Olivos',
  'Lurigancho',
  'Lurín',
  'Magdalena del Mar',
  'Miraflores',
  'Pachacámac',
  'Pucusana',
  'Pueblo Libre',
  'Puente Piedra',
  'Punta Hermosa',
  'Punta Negra',
  'Rímac',
  'San Bartolo',
  'San Borja',
  'San Isidro',
  'San Juan de Lurigancho',
  'San Juan de Miraflores',
  'San Luis',
  'San Martín de Porres',
  'San Miguel',
  'Santa Anita',
  'Santa María del Mar',
  'Santa Rosa',
  'Santiago de Surco',
  'Surquillo',
  'Villa El Salvador',
  'Villa María del Triunfo',
] as const;

export const DISTRITOS_CALLAO = [
  'Bellavista',
  'Callao',
  'Carmen de la Legua Reynoso',
  'La Perla',
  'La Punta',
  'Mi Perú',
  'Ventanilla',
] as const;

/** All 50 districts, in alphabetical order (Spanish collation). */
export const DISTRITOS = [...DISTRITOS_LIMA, ...DISTRITOS_CALLAO].sort((a, b) => a.localeCompare(b, 'es')) as readonly Distrito[];

export type Distrito = (typeof DISTRITOS_LIMA)[number] | (typeof DISTRITOS_CALLAO)[number];
