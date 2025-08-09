#!/usr/bin/env node
import { Command } from 'commander';
import { loadConfig } from '../config/index.js';
import { getLogger } from '../utils/logging.js';
import { randomSalt, hashSecret } from '../utils/hashChain.js';
import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

const program = new Command();
const prisma = new PrismaClient();

program
  .name('canary')
  .description('Canary secrets lifecycle CLI (MVP)')
  .version('0.1.0');

program
  .command('init')
  .description('Initialize local database and config skeleton if missing')
  .action(async () => {
    const cfg = loadConfig();
    getLogger().info({ db: cfg.database.url }, 'Config loaded');
    // Ensure DB file exists by touching via prisma simple query
    if (!process.env.DATABASE_URL) {
      const envPath = path.resolve(process.cwd(), '.env');
      if (!fs.existsSync(envPath)) {
        fs.writeFileSync(envPath, `DATABASE_URL=${cfg.database.url}\n`);
        console.log(`Created .env with DATABASE_URL=${cfg.database.url}`);
      }
      process.env.DATABASE_URL = cfg.database.url;
    }
    // Ensure directory for SQLite file exists if using file: relative path
    const match = /file:(.*)/.exec(process.env.DATABASE_URL!);
    if (match) {
      let dbPath = match[1];
      if (!path.isAbsolute(dbPath)) {
        dbPath = path.resolve(process.cwd(), dbPath);
      }
      const dir = path.dirname(dbPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      // Rewrite env to absolute to avoid mismatch
      process.env.DATABASE_URL = 'file:' + dbPath;
    }
    await prisma.$queryRawUnsafe('SELECT 1');
    console.log('Initialized (db touched, config assumed).');
  });

program
  .command('create')
  .requiredOption('--type <type>', 'Canary type, e.g. aws-iam')
  .option('--placement <placement...>', 'Placement descriptors')
  .description('Create a mock canary and optional placements (MVP simplified)')
  .action(async (opts: { type: string; placement?: string[] }) => {
    const salt = randomSalt();
    const mockSecret = 'MOCK' + Math.random().toString(36).slice(2, 12).toUpperCase();
    const secretHash = hashSecret(mockSecret, salt);
    const normalizedType = opts.type.toLowerCase() === 'aws-iam' ? 'AWS_IAM_KEY' : 'FAKE_API_KEY';
    const canary = await prisma.canary.create({ data: { type: normalizedType, active: true, currentSecretHash: secretHash, salt } });
    if (opts.placement) {
      for (const p of opts.placement) {
        await prisma.placement.create({ data: { canaryId: canary.id, locationType: 'REPO_FILE', locationRef: p } });
      }
    }
    console.log(JSON.stringify({ id: canary.id, mockSecret }, null, 2));
  });

program.parseAsync(process.argv).catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
