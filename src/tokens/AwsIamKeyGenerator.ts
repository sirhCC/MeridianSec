import crypto from 'crypto';
import type { ITokenGenerator, GeneratedToken } from './ITokenGenerator.js';

/**
 * Generator for mock AWS IAM access keys.
 * Format: AKIA<20-char-uppercase-alphanumeric>
 * Note: This is a mock generator. Real AWS integration would use AWS SDK.
 */
export class AwsIamKeyGenerator implements ITokenGenerator {
  readonly type = 'AWS_IAM_KEY';
  private readonly accessKeyPrefix = 'AKIA';
  private readonly alphanumeric = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

  generate(): GeneratedToken {
    // Generate 20 random alphanumeric characters
    let randomPart = '';
    const bytes = crypto.randomBytes(20);
    for (let i = 0; i < 20; i++) {
      randomPart += this.alphanumeric[bytes[i] % this.alphanumeric.length];
    }

    const accessKeyId = `${this.accessKeyPrefix}${randomPart}`;
    const secretAccessKey = crypto.randomBytes(20).toString('base64'); // Mock secret key

    return {
      secret: accessKeyId, // Use access key ID as the tracked secret
      display: `AWS_ACCESS_KEY_ID=${accessKeyId}\nAWS_SECRET_ACCESS_KEY=${secretAccessKey}`,
      metadata: {
        accessKeyId,
        secretAccessKey, // In production, this should be handled more securely
        region: 'us-east-1',
        mock: true,
      },
    };
  }
}
