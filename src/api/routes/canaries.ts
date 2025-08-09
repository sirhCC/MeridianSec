import type { FastifyInstance } from 'fastify';
import { createCanaryBodySchema, toPublicCanary } from '../schemas/canarySchemas.js';
import { CanaryService } from '../../services/canaryService.js';
import { NotFoundError } from '../../repositories/errors.js';

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
}
