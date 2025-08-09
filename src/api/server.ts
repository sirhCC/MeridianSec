import Fastify from 'fastify';
import { getLogger } from '../utils/logging.js';

export async function buildServer() {
  const app = Fastify({ logger: getLogger() });

  app.get('/healthz', async () => {
    return { status: 'ok', time: new Date().toISOString() };
  });

  return app;
}
