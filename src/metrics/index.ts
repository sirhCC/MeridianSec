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
  labelNames: ['adapter'] as const,
  registers: [registry],
});

export const alertFailuresTotal = new Counter({
  name: 'alert_failures_total',
  help: 'Total alert attempts that ultimately failed',
  labelNames: ['adapter'] as const,
  registers: [registry],
});

export const detectionPipelineLatencySeconds = new Histogram({
  name: 'detection_pipeline_latency_seconds',
  help: 'Latency from event emission to persistence (seconds)',
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2],
  registers: [registry],
});

export function metricsSummary() {
  return registry.metrics();
}
