/** Success envelope: `{ message, data }`. Everything leaving over HTTP is built by a Mapper. */
export interface RespuestaDTO<T> {
  message: string;
  data: T;
}

export const respuesta = <T>(message: string, data: T): RespuestaDTO<T> => ({ message, data });
