import { PrismaClient } from '@prisma/client';
import { getLogger } from '../utils/logging.js';

let prisma: PrismaClient | undefined;

export function getPrisma(): PrismaClient {
  if (!prisma) {
    prisma = new PrismaClient();
    const logger = getLogger();
    prisma
      .$connect()
      .then(() => {
        logger.debug('Prisma connected');
      })
      .catch((err) => {
        logger.error({ err }, 'Prisma connection failed');
      });
  }
  return prisma;
}

export async function closePrisma(): Promise<void> {
  if (prisma) {
    await prisma.$disconnect();
    prisma = undefined;
  }
}
