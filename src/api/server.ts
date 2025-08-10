import Fastify from 'fastify';
import { getLogger } from '../utils/logging.js';
import { canaryRoutes } from './routes/canaries.js';
import { AlertFailureRepository } from '../repositories/alertFailureRepository.js';
import { RepositoryError, NotFoundError } from '../repositories/errors.js';
import { DetectionEngine } from '../services/detectionEngine.js';
import { CanaryRepository } from '../repositories/canaryRepository.js';
import { simulateDetectionBodySchema } from './schemas/canarySchemas.js';
import { registry } from '../metrics/index.js';

export async function buildServer() {
  const app = Fastify({ logger: getLogger() });

  // Detection engine (singleton for process)
  const detectionEngine = new DetectionEngine();
  detectionEngine.start();

  app.get('/healthz', async () => {
    const canaryRepo = new CanaryRepository();
    const alertFailureRepo = new AlertFailureRepository();
    const [canaries, detectionInfo] = await Promise.all([
      canaryRepo.list(),
      (async () => detectionEngine.info())(),
    ]);
    const detectionCount = detectionInfo.totalDetections; // quick counter
    return {
      status: 'ok',
      time: new Date().toISOString(),
      build: {
        version: process.env.npm_package_version || 'dev',
        node: process.version,
      },
      canaries: { count: canaries.length },
      detections: { processed: detectionCount },
      engine: {
        lastDetectionProcessedAt: detectionInfo.lastDetectionProcessedAt,
        pollingLoopLastTick: detectionInfo.pollingLoopLastTick,
        running: detectionInfo.running,
      },
      dlq: {
        pending: await alertFailureRepo.pendingCount().catch(() => undefined),
      },
    };
  });

  app.get('/metrics', async (_req, reply) => {
    const body = await registry.metrics();
    reply.header('Content-Type', registry.contentType);
    return reply.send(body);
  });

  // Canary routes
  await app.register(canaryRoutes);

  // (engine already started above)

  app.post('/v1/simulate/detection', async (req, reply) => {
    const parsed = simulateDetectionBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return reply
        .status(400)
        .send({ error: { code: 'VALIDATION_ERROR', message: parsed.error.message } });
    }
    const p = detectionEngine.eventBus.emit('detectionProduced', parsed.data);
    if (process.env.SYNC_DETECTIONS_FOR_TEST === '1') {
      // In test sync mode, wait for detection pipeline to finish before responding
      await p;
    } else {
      void p; // fire-and-forget normal async behavior
    }
    return reply.status(202).send({ accepted: true });
  });

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
