import type { FastifyInstance } from 'fastify';
import { createCanaryBodySchema, toPublicCanary } from '../schemas/canarySchemas.js';
import { CanaryService } from '../../services/canaryService.js';
import { NotFoundError } from '../../repositories/errors.js';
import { DetectionRepository } from '../../repositories/detectionRepository.js';
import { verifyDetectionChain, orderDetectionsByChain } from '../../utils/chainIntegrity.js';

const service = new CanaryService();

export async function canaryRoutes(app: FastifyInstance) {
  app.post('/v1/canaries', async (req, reply) => {
    const parsed = createCanaryBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return reply
        .status(400)
        .send({ error: { code: 'VALIDATION_ERROR', message: parsed.error.message } });
    }
    const { canary, placements } = await service.create(parsed.data);
    return reply.status(201).send({ canary: toPublicCanary(canary), placements });
  });

  interface IdParams {
    id: string;
  }
  app.get<{ Params: IdParams }>('/v1/canaries/:id', async (req, reply) => {
    const id = req.params.id;
    try {
      const { canary, placements } = await service.get(id);
      return { canary: toPublicCanary(canary), placements };
    } catch (err) {
      if (err instanceof NotFoundError) {
        return reply.status(404).send({ error: { code: 'NOT_FOUND', message: err.message } });
      }
      throw err;
    }
  });

  app.get('/v1/canaries', async () => {
    const list = await service.list();
    return { canaries: list.map(toPublicCanary) };
  });

  // Rotate canary secret (mock rotation) – returns new hash; secret (mock) only returned once here
  app.post<{ Params: IdParams }>('/v1/canaries/:id/rotate', async (req, reply) => {
    const id = req.params.id;
    try {
      const { rotation, canary, generatedSecret } = await service.rotate(id, 'api');
      return reply
        .status(200)
        .send({ canary: toPublicCanary(canary), rotation, mockSecret: generatedSecret });
    } catch (err) {
      if (err instanceof NotFoundError) {
        return reply.status(404).send({ error: { code: 'NOT_FOUND', message: err.message } });
      }
      throw err;
    }
  });

  // List detections for a canary (hash chain order ascending by detectionTime)
  app.get<{ Params: IdParams }>('/v1/canaries/:id/detections', async (req, reply) => {
    const id = req.params.id;
    const detRepo = new DetectionRepository();
    try {
      // ensure canary exists (will throw NotFoundError if not)
      await service.get(id);
    } catch (err) {
      if (err instanceof NotFoundError) {
        return reply.status(404).send({ error: { code: 'NOT_FOUND', message: err.message } });
      }
      throw err;
    }
    const detections = await detRepo.listByCanary(id);
    const ordered = orderDetectionsByChain(detections);
    return { detections: ordered };
  });

  // Verify detection hash chain integrity
  app.get<{ Params: IdParams }>('/v1/canaries/:id/detections/verify', async (req, reply) => {
    const id = req.params.id;
    const detRepo = new DetectionRepository();
    try {
      await service.get(id);
    } catch (err) {
      if (err instanceof NotFoundError) {
        return reply.status(404).send({ error: { code: 'NOT_FOUND', message: err.message } });
      }
      throw err;
    }
    const detections = orderDetectionsByChain(await detRepo.listByCanary(id));
    const result = verifyDetectionChain(detections);
    return { canaryId: id, ...result };
  });
}
