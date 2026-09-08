/** Success envelope: `{ message, data }`. Everything leaving over HTTP is built by a Mapper. */
export interface RespuestaDTO<T> {
  message: string;
  data: T;
}

export const respuesta = <T>(message: string, data: T): RespuestaDTO<T> => ({ message, data });

/** Success envelope for operations with nothing to return (e.g. password change): `{ message }`. */
export const respuestaSinDatos = (message: string): { message: string } => ({ message });
