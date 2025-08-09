import { getLogger } from '../utils/logging.js';
import { alertsSentTotal, alertFailuresTotal } from '../metrics/index.js';
import { buildCanonicalPayload, hmacSign } from '../utils/signing.js';

// Basic in-memory metrics (to be exported later via /metrics when implemented)
const metrics = {
  alertsSent: 0,
  alertsFailed: 0,
};
export function getAlertMetrics() {
  return { ...metrics };
}

export interface AlertChannel {
  send(payload: AlertPayload): Promise<void>;
}

export interface AlertPayload {
  canaryId: string;
  detectionId: string;
  correlationId: string;
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
  async send(payload: AlertPayload, extraHeaders?: Record<string, string>): Promise<void> {
    const headers = {
      'content-type': 'application/json',
      ...(this.cfg.headers || {}),
      ...(extraHeaders || {}),
    };
    const res = await fetch(this.cfg.url, {
      method: this.cfg.method || 'POST',
      headers,
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      throw new Error(`webhook responded ${res.status}`);
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
      this.channels.map(async (c) => {
        const maxAttempts = 3;
        let attempt = 0;
        while (attempt < maxAttempts) {
          try {
            // If webhook channel and signing secret present, wrap send with signature header injection
            if (c instanceof WebhookAlertChannel && process.env.ALERT_HMAC_SECRET) {
              const canonical = buildCanonicalPayload(full);
              const signature = hmacSign(canonical, process.env.ALERT_HMAC_SECRET);
              await c.send(full, { 'x-canary-signature': signature });
            } else {
              await c.send(full);
            }
            metrics.alertsSent += 1;
            alertsSentTotal.inc({ adapter: c.constructor.name, status: 'sent' });
            return;
          } catch (err) {
            attempt++;
            if (attempt >= maxAttempts) {
              metrics.alertsFailed += 1;
              alertFailuresTotal.inc({
                adapter: c.constructor.name,
                reason: (err as Error).name || 'Error',
              });
              getLogger().error({ err, attempts: attempt }, 'alert send failed');
              return;
            }
            // exponential backoff (50ms, 150ms)
            const delay = 50 * Math.pow(3, attempt - 1);
            await new Promise((r) => setTimeout(r, delay));
          }
        }
      }),
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
