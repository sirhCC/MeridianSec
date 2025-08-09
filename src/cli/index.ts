#!/usr/bin/env node
import { Command } from 'commander';
import { loadConfig } from '../config/index.js';
import { getLogger } from '../utils/logging.js';
import { randomSalt, hashSecret } from '../utils/hashChain.js';
import { PrismaClient } from '@prisma/client';
import http from 'http';
import fs from 'fs';
import path from 'path';

const program = new Command();
const prisma = new PrismaClient();
const USE_API = process.env.USE_API === '1';
const API_BASE = process.env.API_BASE || 'http://localhost:3000';

program.name('canary').description('Canary secrets lifecycle CLI (MVP)').version('0.1.0');

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

    if (USE_API) {
      // Call API endpoint instead of direct DB
      const payload = JSON.stringify({
        type: normalizedType,
        currentSecretHash: secretHash,
        salt,
        placements: (opts.placement || []).map((p) => ({
          locationType: 'REPO_FILE',
          locationRef: p,
        })),
      });
      const url = new URL('/v1/canaries', API_BASE);
      const resBody = await httpRequest(
        {
          method: 'POST',
          hostname: url.hostname,
          port: url.port || (url.protocol === 'https:' ? 443 : 80),
          path: url.pathname,
          protocol: url.protocol,
          headers: {
            'content-type': 'application/json',
            'content-length': Buffer.byteLength(payload).toString(),
          },
        },
        payload,
      );
      const parsed = JSON.parse(resBody);
      if (parsed.error) {
        console.error('API Error:', parsed.error);
        process.exit(1);
      }
      console.log(JSON.stringify({ id: parsed.canary.id, mockSecret }, null, 2));
      return;
    }

    // Legacy direct DB path
    const canary = await prisma.canary.create({
      data: { type: normalizedType, active: true, currentSecretHash: secretHash, salt },
    });
    if (opts.placement) {
      for (const p of opts.placement) {
        await prisma.placement.create({
          data: { canaryId: canary.id, locationType: 'REPO_FILE', locationRef: p },
        });
      }
    }
    console.log(JSON.stringify({ id: canary.id, mockSecret }, null, 2));
  });

program
  .command('verify-chain')
  .requiredOption('--canary-id <id>', 'Canary id to verify')
  .description('Verify detection hash chain integrity for a canary (API mode only)')
  .action(async (opts: { canaryId: string }) => {
    if (!USE_API) {
      console.error('verify-chain requires USE_API=1');
      process.exit(1);
    }
    const url = new URL(`/v1/canaries/${opts.canaryId}/detections/verify`, API_BASE);
    const body = await httpRequest(
      {
        method: 'GET',
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: url.pathname,
        protocol: url.protocol,
      },
      '',
    );
    const parsed = JSON.parse(body);
    if (parsed.error) {
      console.error(parsed.error);
      process.exit(1);
    }
    if (!parsed.valid) {
      console.error('Chain INVALID:', JSON.stringify(parsed.breaks, null, 2));
      process.exit(2);
    }
    console.log('Chain valid. Last hash:', parsed.lastHash || 'none');
  });

program
  .command('rotate')
  .requiredOption('--canary-id <id>', 'Canary id to rotate')
  .description('Rotate a canary secret (mock). API mode only returns new mockSecret once.')
  .action(async (opts: { canaryId: string }) => {
    if (!USE_API) {
      console.error('rotate requires USE_API=1');
      process.exit(1);
    }
    const url = new URL(`/v1/canaries/${opts.canaryId}/rotate`, API_BASE);
    const body = await httpRequest(
      {
        method: 'POST',
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: url.pathname,
        protocol: url.protocol,
      },
      '',
    );
    const parsed = JSON.parse(body);
    if (parsed.error) {
      console.error(parsed.error);
      process.exit(1);
    }
    console.log(
      JSON.stringify(
        { id: parsed.canary.id, mockSecret: parsed.mockSecret, rotation: parsed.rotation },
        null,
        2,
      ),
    );
  });

function httpRequest(options: http.RequestOptions, body: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (d) => chunks.push(d));
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

program.parseAsync(process.argv).catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
