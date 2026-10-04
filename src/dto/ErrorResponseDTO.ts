import type { DetalleError } from '../exception/AppException.js';

/** Error envelope of every failed request. `message` is always present (the app reads it). */
export interface ErrorResponseDTO {
  message: string;
  code: string;
  errors: readonly DetalleError[];
  /** Only on 500: correlates the response with the server log line (same value as X-Request-Id). */
  requestId?: string;
}
