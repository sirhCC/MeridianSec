import crypto from 'crypto';

export function computeHashChain(prev: string | null | undefined, canonicalJson: string): string {
  const prevPart = prev || '';
  return crypto.createHash('sha256').update(prevPart + canonicalJson).digest('hex');
}

export function hashSecret(secret: string, salt: string): string {
  return crypto.createHash('sha256').update(salt + secret).digest('hex');
}

export function randomSalt(bytes = 16): string {
  return crypto.randomBytes(bytes).toString('hex');
}
