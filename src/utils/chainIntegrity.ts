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
