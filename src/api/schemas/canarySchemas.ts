import { z } from 'zod';

export const placementSchema = z.object({
  locationType: z.enum(['REPO_FILE', 'CI_VAR', 'S3_OBJECT', 'ENV_FILE']),
  locationRef: z.string().min(1),
});

export const createCanaryBodySchema = z.object({
  type: z.enum(['AWS_IAM_KEY', 'FAKE_API_KEY']),
  placements: z.array(placementSchema).optional(),
  currentSecretHash: z.string().min(10),
  salt: z.string().min(1),
});

export type CreateCanaryBody = z.infer<typeof createCanaryBodySchema>;

interface InternalCanaryLike {
  id: string;
  type: string;
  active: boolean;
  createdAt: Date;
}
export function toPublicCanary(c: InternalCanaryLike) {
  return {
    id: c.id,
    type: c.type,
    active: c.active,
    createdAt: c.createdAt,
  };
}
