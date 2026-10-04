import type { PlataformaPush } from '../enum/PlataformaPush.js';

/** Domain entity for `dispositivo_push`: an FCM registration token of a user's device (M3). */
export interface DispositivoPush {
  id: number;
  usuarioId: number;
  tokenFcm: string;
  plataforma: PlataformaPush;
  createdAt: Date;
  updatedAt: Date;
}
