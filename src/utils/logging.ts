import pino, { DestinationStream } from 'pino';
import { Writable } from 'stream';
import { loadConfig } from '../config/index.js';

let loggerInstance: pino.Logger | null = null;

export function getLogger() {
  if (!loggerInstance) {
    const cfg = loadConfig();
    if (process.env.TEST_LOG_COLLECTOR === '1') {
      const logs: string[] = [];
      (globalThis as unknown as { __LOG_COLLECTOR__?: string[] }).__LOG_COLLECTOR__ = logs;
      const sink = new Writable({
        write(chunk, _enc, cb) {
          logs.push(chunk.toString());
          cb();
        },
      });
      loggerInstance = pino({ level: cfg.logging.level }, sink as unknown as DestinationStream);
    } else {
      loggerInstance = pino({
        level: cfg.logging.level,
        transport: cfg.logging.json ? undefined : { target: 'pino-pretty' },
      });
    }
  }
  return loggerInstance;
}

// Test-only helper to reset singleton (not exported in production docs)
export function __resetLoggerForTests() {
  loggerInstance = null;
}

// Force-enable in-memory log collection for tests regardless of env timing
export function __enableTestLogCollector() {
  const cfg = loadConfig();
  const logs: string[] = [];
  (globalThis as unknown as { __LOG_COLLECTOR__?: string[] }).__LOG_COLLECTOR__ = logs;
  const sink = new Writable({
    write(chunk, _enc, cb) {
      logs.push(chunk.toString());
      cb();
    },
  });
  loggerInstance = pino({ level: cfg.logging.level }, sink as unknown as DestinationStream);
  return logs;
}
