import pino from 'pino';
import type { Logger } from '../../src/util/logger.js';

/** Logger that discards everything; the default for tests that do not inspect logs. */
export const crearLoggerSilencioso = (): Logger => pino({ level: 'silent' });
