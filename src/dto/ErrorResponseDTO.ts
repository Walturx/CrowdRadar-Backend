import type { DetalleError } from '../exception/AppException.js';

/** Error envelope of every failed request. `message` is always present (the app reads it). */
export interface ErrorResponseDTO {
  message: string;
  code: string;
  errors: readonly DetalleError[];
}
