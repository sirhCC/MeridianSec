import { Counter, Histogram, Registry, collectDefaultMetrics } from 'prom-client';

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

export function metricsSummary() {
  return registry.metrics();
}
