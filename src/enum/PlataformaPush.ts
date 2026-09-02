/** Push device platform; mirrors ck_dispositivo_plataforma (migration 10). */
export const PlataformaPush = {
  ANDROID: 'ANDROID',
  IOS: 'IOS',
} as const;

export type PlataformaPush = (typeof PlataformaPush)[keyof typeof PlataformaPush];
