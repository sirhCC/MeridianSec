import { PrismaClient } from '@prisma/client';
import { getLogger } from '../utils/logging.js';

let prisma: PrismaClient | undefined;
let connectPromise: Promise<PrismaClient> | undefined;
let isConnected = false;

export function getPrisma(): PrismaClient {
  if (!prisma) {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL must be set before accessing Prisma client');
    }
    prisma = new PrismaClient();
    const logger = getLogger();
    // Explicitly connect - this ensures the engine starts up
    connectPromise = prisma
      .$connect()
      .then(() => {
        logger.debug('Prisma connected');
        isConnected = true;
        return prisma!;
      })
      .catch((err) => {
        logger.error({ err }, 'Prisma connection failed');
        throw err;
      });
  }
  return prisma;
}

// For async contexts where we need to ensure connection before first query
export async function ensurePrismaConnected(): Promise<PrismaClient> {
  const client = getPrisma(); // Initialize if needed

  // If already connected, return immediately
  if (isConnected) {
    return client;
  }

  // Otherwise wait for the connection promise
  if (connectPromise) {
    await connectPromise;
  }

  return client;
}

export async function closePrisma(): Promise<void> {
  if (prisma) {
    await prisma.$disconnect();
    prisma = undefined;
    isConnected = false;
  }
}

// For tests: reset the singleton to allow re-initialization with new DATABASE_URL
export async function resetPrisma(): Promise<void> {
  if (prisma) {
    await prisma.$disconnect();
  }
  prisma = undefined;
  connectPromise = undefined;
  isConnected = false;
}
