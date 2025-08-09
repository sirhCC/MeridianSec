import Fastify from 'fastify';
import { getLogger } from '../utils/logging.js';
import { canaryRoutes } from './routes/canaries.js';
import { RepositoryError, NotFoundError } from '../repositories/errors.js';

export async function buildServer() {
  const app = Fastify({ logger: getLogger() });

  app.get('/healthz', async () => {
    return { status: 'ok', time: new Date().toISOString() };
  });

  // Canary routes
  await app.register(canaryRoutes);

  // Unified error handler (fallback)
  app.setErrorHandler((error, _req, reply) => {
    if (error instanceof NotFoundError) {
      return reply.status(404).send({ error: { code: 'NOT_FOUND', message: error.message } });
    }
    if (error instanceof RepositoryError) {
      return reply
        .status(500)
        .send({ error: { code: 'REPOSITORY_ERROR', message: error.message } });
    }
    if (isValidationError(error)) {
      // Fastify validation errors (not used yet with zod pre-parse)
      return reply
        .status(400)
        .send({ error: { code: 'VALIDATION_ERROR', message: error.message } });
    }
    app.log.error({ err: error }, 'Unhandled error');
    return reply
      .status(500)
      .send({ error: { code: 'INTERNAL', message: 'Internal Server Error' } });
  });

  function isValidationError(err: unknown): err is { message: string } {
    if (typeof err !== 'object' || err === null) return false;
    const rec = err as Record<string, unknown>;
    return typeof rec.message === 'string' && 'validation' in rec;
  }
  return app;
}
