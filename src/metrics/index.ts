import { Counter, Histogram, Gauge, Registry, collectDefaultMetrics } from 'prom-client';

export const registry = new Registry();
collectDefaultMetrics({ register: registry });

export const detectionsTotal = new Counter({
  name: 'detections_total',
  help: 'Total detections processed',
  labelNames: ['source'] as const,
  registers: [registry],
});

export const alertsSentTotal = new Counter({
  name: 'alerts_sent_total',
  help: 'Total alerts successfully sent',
  labelNames: ['adapter', 'status'] as const, // status currently always 'sent' (extensible later)
  registers: [registry],
});

export const alertFailuresTotal = new Counter({
  name: 'alert_failures_total',
  help: 'Total alert attempts that ultimately failed',
  labelNames: ['adapter', 'reason'] as const,
  registers: [registry],
});

export const detectionPipelineLatencySeconds = new Histogram({
  name: 'detection_pipeline_latency_seconds',
  help: 'Latency from event emission to persistence (seconds)',
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2],
  registers: [registry],
});

// Total secret rotations performed
export const rotationsTotal = new Counter({
  name: 'rotations_total',
  help: 'Total canary secret rotations performed',
  labelNames: ['type'] as const, // type: e.g., 'default', future: 'aws'
  registers: [registry],
});

// Integrity verification results (label result=valid|invalid)
export const integrityVerificationsTotal = new Counter({
  name: 'integrity_verifications_total',
  help: 'Total detection chain integrity verifications',
  labelNames: ['result'] as const,
  registers: [registry],
});

// Failures (subset) with reason (PREV_MISMATCH|CURR_MISMATCH)
export const integrityFailuresTotal = new Counter({
  name: 'integrity_failures_total',
  help: 'Detection chain integrity verification failures by reason',
  labelNames: ['reason'] as const,
  registers: [registry],
});

// Rotation latency
export const rotationsLatencySeconds = new Histogram({
  name: 'rotations_latency_seconds',
  help: 'Latency of a canary secret rotation (seconds)',
  buckets: [0.005, 0.01, 0.05, 0.1, 0.25, 0.5, 1],
  registers: [registry],
});

// Poll loop last tick (unix seconds)
export const pollLoopLastTickSeconds = new Gauge({
  name: 'poll_loop_last_tick_seconds',
  help: 'Unix timestamp (seconds) of last poll loop tick',
  registers: [registry],
});

// Alert retries (attempts >1)
export const alertRetriesTotal = new Counter({
  name: 'alert_retries_total',
  help: 'Total alert send retry attempts (excluding first attempt)',
  labelNames: ['adapter'] as const,
  registers: [registry],
});

export const alertRetryDelayMs = new Histogram({
  name: 'alert_retry_delay_ms',
  help: 'Backoff delay applied before alert retry (milliseconds)',
  buckets: [10, 50, 100, 200, 400, 800, 1600],
  registers: [registry],
});

// Replay outcomes (via CLI replay-failures)
export const alertReplaysTotal = new Counter({
  name: 'alert_replays_total',
  help: 'Number of alert failure records replayed (attempted)',
  labelNames: ['result'] as const, // result=success|failure
  registers: [registry],
});
export const alertReplayLatencyMs = new Histogram({
  name: 'alert_replay_latency_ms',
  help: 'Latency of individual replay attempts (milliseconds)',
  buckets: [5, 10, 25, 50, 100, 250, 500, 1000, 2000],
  registers: [registry],
});

export function metricsSummary() {
  return registry.metrics();
}
