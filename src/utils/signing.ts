import crypto from 'crypto';

export function hmacSign(body: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(body, 'utf8').digest('hex');
}

export function buildCanonicalPayload(obj: unknown): string {
  // Stable stringify by sorting object keys recursively
  return JSON.stringify(sortObj(obj));
}

function sortObj(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortObj);
  if (value && typeof value === 'object') {
    const rec = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(rec).sort()) {
      out[key] = sortObj(rec[key]);
    }
    return out;
  }
  return value;
}
