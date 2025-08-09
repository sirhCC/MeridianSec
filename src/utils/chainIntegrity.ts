import type { Detection } from '../core/types.js';
import { computeHashChain } from './hashChain.js';

export interface ChainBreak {
  index: number; // index within provided detections array (ascending chronological order expected)
  detectionId: string;
  reason: 'PREV_MISMATCH' | 'CURR_MISMATCH';
  expected?: string | null; // expected prev or curr hash depending on reason
  actual?: string | null; // actual prev or curr hash depending on reason
}

export interface ChainVerificationResult {
  valid: boolean;
  breaks: ChainBreak[];
  lastHash?: string | null; // last valid hash in the verified portion
}

/**
 * Verifies integrity of a detection hash chain.
 * Input should be detections sorted ascending by detectionTime (oldest -> newest).
 */
export function verifyDetectionChain(detections: Detection[]): ChainVerificationResult {
  const breaks: ChainBreak[] = [];
  let prevHash: string | null = null;
  let lastValid: string | null = null;

  for (let i = 0; i < detections.length; i++) {
    const d = detections[i];
    // Check prev link
    const expectedPrev = prevHash;
    const actualPrev = d.hashChainPrev ?? null;
    if (actualPrev !== expectedPrev) {
      breaks.push({
        index: i,
        detectionId: d.id,
        reason: 'PREV_MISMATCH',
        expected: expectedPrev,
        actual: actualPrev,
      });
      // Once broken, we can't reliably continue — exit early
      return { valid: false, breaks, lastHash: lastValid };
    }

    // Reconstruct canonical JSON exactly as in DetectionEngine
    const canonical = JSON.stringify({
      canaryId: d.canaryId,
      source: d.source,
      rawEventJson: d.rawEventJson,
      confidenceScore: d.confidenceScore,
      actorIdentity: d.actorIdentity || null,
      prev: expectedPrev,
    });
    const expectedCurr = computeHashChain(expectedPrev, canonical);
    const actualCurr = d.hashChainCurr;
    if (actualCurr !== expectedCurr) {
      breaks.push({
        index: i,
        detectionId: d.id,
        reason: 'CURR_MISMATCH',
        expected: expectedCurr,
        actual: actualCurr,
      });
      return { valid: false, breaks, lastHash: lastValid };
    }

    prevHash = actualCurr;
    lastValid = actualCurr;
  }

  return { valid: breaks.length === 0, breaks, lastHash: lastValid };
}

// Attempt to order detections following the hash chain starting at head (hashChainPrev null).
// Falls back to input order if inconsistent.
export function orderDetectionsByChain(detections: Detection[]): Detection[] {
  if (detections.length <= 1) return detections.slice();
  const byPrev = new Map<string | null, Detection[]>();
  const byCurr = new Map<string, Detection>();
  for (const d of detections) {
    const arr = byPrev.get(d.hashChainPrev ?? null) || [];
    arr.push(d);
    byPrev.set(d.hashChainPrev ?? null, arr);
    byCurr.set(d.hashChainCurr, d);
  }
  const heads = byPrev.get(null) || [];
  if (heads.length !== 1) return detections; // ambiguous
  const ordered: Detection[] = [];
  let current = heads[0];
  ordered.push(current);
  for (;;) {
    const nextCandidates = byPrev.get(current.hashChainCurr) || [];
    if (nextCandidates.length === 0) break;
    if (nextCandidates.length > 1) return detections; // branch -> ambiguous
    current = nextCandidates[0];
    ordered.push(current);
    if (ordered.length > detections.length) return detections; // cycle guard
  }
  if (ordered.length !== detections.length) return detections; // disconnected segments
  return ordered;
}
