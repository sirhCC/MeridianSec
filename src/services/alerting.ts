import { getLogger } from '../utils/logging.js';

export interface AlertChannel {
  send(payload: AlertPayload): Promise<void>;
}

export interface AlertPayload {
  canaryId: string;
  detectionId: string;
  confidenceScore: number;
  source: string;
  hash: string;
  createdAt: string;
  message: string;
}

export class StdoutAlertChannel implements AlertChannel {
  async send(payload: AlertPayload): Promise<void> {
    // Single-line JSON for easy log scraping
    getLogger().warn({ alert: payload }, 'detection-alert');
  }
}

export interface WebhookConfig {
  url: string;
  method?: 'POST' | 'PUT';
  headers?: Record<string, string>;
}

export class WebhookAlertChannel implements AlertChannel {
  constructor(private cfg: WebhookConfig) {}
  async send(payload: AlertPayload): Promise<void> {
    // Use global fetch (Node 18+)
    const res = await fetch(this.cfg.url, {
      method: this.cfg.method || 'POST',
      headers: { 'content-type': 'application/json', ...(this.cfg.headers || {}) },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      getLogger().error({ status: res.status }, 'webhook alert failed');
    }
  }
}

export interface AlertingOptions {
  threshold: number; // confidence score threshold
  webhook?: WebhookConfig;
  enableStdout?: boolean;
}

export class AlertingService {
  private channels: AlertChannel[] = [];
  constructor(private opts: AlertingOptions) {
    if (opts.enableStdout !== false) {
      this.channels.push(new StdoutAlertChannel());
    }
    if (opts.webhook) {
      this.channels.push(new WebhookAlertChannel(opts.webhook));
    }
  }

  async maybeAlert(payload: Omit<AlertPayload, 'message'>) {
    if (payload.confidenceScore < this.opts.threshold) return;
    const message = `Detection ${payload.detectionId} (canary ${payload.canaryId}) score ${payload.confidenceScore} >= ${this.opts.threshold}`;
    const full: AlertPayload = { ...payload, message };
    await Promise.all(
      this.channels.map((c) =>
        c.send(full).catch((err) => getLogger().error({ err }, 'alert send failed')),
      ),
    );
  }
}

// Simple config loader for alerting (env-based)
export function loadAlertingFromEnv(): AlertingService | null {
  const threshRaw = process.env.ALERT_THRESHOLD;
  if (!threshRaw) return null; // disabled if not set
  const threshold = parseInt(threshRaw, 10);
  if (Number.isNaN(threshold)) return null;
  const webhookUrl = process.env.ALERT_WEBHOOK_URL;
  return new AlertingService({
    threshold,
    enableStdout: process.env.ALERT_STDOUT === '0' ? false : true,
    webhook: webhookUrl ? { url: webhookUrl } : undefined,
  });
}
