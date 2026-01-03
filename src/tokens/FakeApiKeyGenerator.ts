import crypto from 'crypto';
import type { ITokenGenerator, GeneratedToken } from './ITokenGenerator.js';

/**
 * Generator for fake API key style tokens.
 * Format: PREFIX_<32-char-hex>
 * Example: CNRY_a1b2c3d4e5f67890abcdef1234567890
 */
export class FakeApiKeyGenerator implements ITokenGenerator {
  readonly type = 'FAKE_API_KEY';
  private readonly prefix = 'CNRY';

  generate(): GeneratedToken {
    const randomHex = crypto.randomBytes(16).toString('hex'); // 32 chars
    const secret = `${this.prefix}_${randomHex}`;

    return {
      secret,
      display: `API_KEY=${secret}`,
      metadata: {
        prefix: this.prefix,
        length: secret.length,
        format: 'hex',
      },
    };
  }
}
