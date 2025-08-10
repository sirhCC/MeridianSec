#!/usr/bin/env node
import {
  alertReplaysTotal,
  alertReplayLatencyMs,
  alertFailuresPurgedTotal,
} from '../metrics/index.js';
import { Command } from 'commander';
import { loadConfig } from '../config/index.js';
import { getLogger } from '../utils/logging.js';
import { randomSalt, hashSecret } from '../utils/hashChain.js';
import { PrismaClient } from '@prisma/client';
import { AlertFailureRepository } from '../repositories/alertFailureRepository.js';
import { loadAlertingFromEnv } from '../services/alerting.js';
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

program
  .command('replay-failures')
  .option('-l, --limit <n>', 'Number of recent failures to list', '50')
  .option('-r, --replay', 'Attempt replay after listing', false)
  .description(
    'List dead-lettered alert failures and optionally replay them (env alerting must be enabled)',
  )
  .action(async (opts: { limit?: string; replay?: boolean }) => {
    const repo = new AlertFailureRepository();
    const limit = parseInt(opts.limit || '50', 10) || 50;
    const failures = await repo.list(limit);
    if (!failures.length) {
      console.log('No alert failures found');
      return;
    }
    for (const f of failures) {
      console.log(
        JSON.stringify(
          {
            id: f.id,
            detectionId: f.detectionId,
            canaryId: f.canaryId,
            adapter: f.adapter,
            reason: f.reason,
            attempts: f.attempts,
            createdAt: f.createdAt,
            replayedAt: f.replayedAt,
            replaySuccess: f.replaySuccess,
          },
          null,
          2,
        ),
      );
    }
    if (!opts.replay) return;
    const alerting = loadAlertingFromEnv();
    if (!alerting) {
      console.error('Alerting disabled (ALERT_THRESHOLD not set) – cannot replay');
      process.exit(1);
    }
    let anyFailure = false;
    for (const f of failures) {
      try {
        const payload = JSON.parse(f.payloadJson);
        const start = Date.now();
        // AlertingService has maybeAlert method; casting narrow to expected shape
        await (alerting as ReturnType<typeof loadAlertingFromEnv>)!.maybeAlert({
          canaryId: payload.canaryId,
          detectionId: payload.detectionId,
          correlationId: payload.correlationId,
          confidenceScore: payload.confidenceScore,
          source: payload.source,
          hash: payload.hash,
          createdAt: payload.createdAt,
        });
        await repo.markReplay(f.id, true);
        console.log(`Replayed ${f.id} OK`);
        try {
          alertReplaysTotal.inc({ result: 'success' });
        } catch {
          /* metrics optional */
        }
        try {
          alertReplayLatencyMs.observe(Date.now() - start);
        } catch {
          /* metrics optional */
        }
      } catch (err) {
        await repo.markReplay(f.id, false);
        console.error('Replay failed', f.id, err);
        anyFailure = true;
        try {
          alertReplaysTotal.inc({ result: 'failure' });
        } catch {
          /* metrics optional */
        }
      }
    }
    if (anyFailure) process.exitCode = 2; // signal partial failure without aborting listing output
  });

program
  .command('purge-failures')
  .description('Purge alert failure (DLQ) records by retention criteria')
  .option('--older-than <days>', 'Delete records older than N days (createdAt)', '30')
  .option(
    '--replayed-only',
    'Only purge records that have been replayed (success or failure)',
    false,
  )
  .option(
    '--successful-only',
    'Only purge records replayed successfully (implies --replayed-only)',
    false,
  )
  .option('--dry-run', 'Do not delete, only report count', false)
  .option('--json', 'Always emit JSON (default).', false)
  .option('--quiet', 'Suppress non-error output (overrides --json human messages)', false)
  .option('--force', 'Skip confirmation prompt', false)
  .action(
    async (opts: {
      olderThan?: string;
      replayedOnly?: boolean;
      successfulOnly?: boolean;
      dryRun?: boolean;
      json?: boolean;
      quiet?: boolean;
      force?: boolean;
    }) => {
      const repo = new AlertFailureRepository();
      const days = parseInt(opts.olderThan || '30', 10);
      if (Number.isNaN(days) || days <= 0) {
        console.error('--older-than must be a positive integer');
        process.exit(2); // validation error
      }
      const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      const successfulOnly = !!opts.successfulOnly;
      const replayedOnly = successfulOnly ? true : !!opts.replayedOnly;
      const dryRun = !!opts.dryRun;
      const wantJson = !!opts.json || true; // current default JSON output
      const quiet = !!opts.quiet;
      const force = !!opts.force;

      // Pre-count (dry-run style) to show confirmation prompt scale if not a dryRun
      let prospectiveCount = 0;
      try {
        const { count } = await repo.purge({
          olderThan: cutoff,
          successfulOnly,
          replayedOnly,
          dryRun: true,
        });
        prospectiveCount = count;
      } catch {
        /* ignore pre-count failure */
      }

      const confirmThreshold = parseInt(process.env.PURGE_CONFIRM_THRESHOLD || '50', 10);
      if (!dryRun && !force && prospectiveCount >= confirmThreshold) {
        if (!quiet) {
          process.stdout.write(
            `About to delete ${prospectiveCount} alert failure records. Type YES to confirm: `,
          );
        }
        const answer = await new Promise<string>((resolve) => {
          process.stdin.resume();
          process.stdin.once('data', (d) => resolve(d.toString().trim()));
        });
        if (answer !== 'YES') {
          if (!quiet) console.error('Aborted (confirmation mismatch).');
          process.exit(3); // aborted
        }
      }

      // metrics delta (best effort) – rely on known deletion count rather than internal prom-client state
      let delta = 0;
      const { count } = await repo.purge({
        olderThan: cutoff,
        successfulOnly,
        replayedOnly,
        dryRun,
      });
      try {
        alertFailuresPurgedTotal.inc({ mode: dryRun ? 'dry_run' : 'deleted' }, dryRun ? 0 : count);
        delta = dryRun ? 0 : count; // since we just incremented by count
      } catch {
        delta = dryRun ? 0 : count; // fallback assume success
      }
      const payload = {
        deleted: dryRun ? 0 : count,
        wouldDelete: dryRun ? count : undefined,
        criteria: {
          olderThanDays: days,
          replayedOnly,
          successfulOnly,
          dryRun,
        },
        metricsDelta: {
          alertFailuresPurgedTotal: { delta },
        },
      };
      if (!quiet && wantJson) {
        console.log(JSON.stringify(payload, null, 2));
      }
      // quiet mode: no output
    },
  );

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
