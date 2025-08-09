import pino from 'pino';
import { loadConfig } from '../config/index.js';

let loggerInstance: pino.Logger | null = null;

export function getLogger() {
  if (!loggerInstance) {
    const cfg = loadConfig();
    loggerInstance = pino({
      level: cfg.logging.level,
      transport: cfg.logging.json ? undefined : { target: 'pino-pretty' },
    });
  }
  return loggerInstance;
}

// Test-only helper to reset singleton (not exported in production docs)
export function __resetLoggerForTests() {
  loggerInstance = null;
}
