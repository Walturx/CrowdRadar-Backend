/**
 * Informational level of a user, a pure function of their points (CRO-72; thresholds in `entity/puntaje.ts`). Not stored:
 * these are the wire values of `tier`. Shown as Crowd Baby, Crowd Explorer, Crowd Collaborator and Crowd Royalty.
 */
export const Tier = {
  CROWD_BABY: 'CROWD_BABY',
  CROWD_EXPLORER: 'CROWD_EXPLORER',
  CROWD_COLLABORATOR: 'CROWD_COLLABORATOR',
  CROWD_ROYALTY: 'CROWD_ROYALTY',
} as const;

export type Tier = (typeof Tier)[keyof typeof Tier];
