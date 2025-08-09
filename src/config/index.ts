import { z } from 'zod';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const ConfigSchema = z.object({
  database: z.object({
    provider: z.literal('sqlite'),
    url: z.string().min(1),
  }),
  alerting: z.object({
    slackWebhook: z.string().optional(),
    webhookSignatureSecret: z.string().optional(),
  }),
  cloudtrail: z.object({
    mode: z.enum(['mock']).default('mock'),
    pollIntervalMs: z.number().int().positive().default(5000),
  }),
  logging: z.object({
    level: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
    json: z.boolean().default(true),
  }),
});

export type AppConfig = z.infer<typeof ConfigSchema>;

export function loadConfig(configPath = 'canary.config.json'): AppConfig {
  const full = path.resolve(process.cwd(), configPath);
  let fileRaw: Record<string, unknown> = {};
  if (fs.existsSync(full)) {
    try {
      fileRaw = JSON.parse(fs.readFileSync(full, 'utf8'));
    } catch (e) {
      throw new Error(`Failed to parse config file ${full}: ${(e as Error).message}`);
    }
  }
  const merged = {
    database: {
      provider: 'sqlite',
      url: process.env.DATABASE_URL || 'file:./data/canary.db',
      ...(fileRaw.database || {}),
    },
    alerting: {
      slackWebhook: process.env.SLACK_WEBHOOK_URL,
      webhookSignatureSecret: process.env.ALERT_SIGNING_KEY,
      ...(fileRaw.alerting || {}),
    },
    cloudtrail: {
      mode: 'mock',
      pollIntervalMs: Number(process.env.CLOUDTRAIL_POLL_INTERVAL_MS) || 5000,
      ...(fileRaw.cloudtrail || {}),
    },
    logging: { level: process.env.LOG_LEVEL || 'info', json: true, ...(fileRaw.logging || {}) },
  };
  const parsed = ConfigSchema.parse(merged);
  return parsed;
}
