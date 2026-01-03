import { describe, it, expect, beforeEach } from 'vitest';
import { TokenGeneratorFactory } from '../../src/tokens/TokenGeneratorFactory.js';
import { FakeApiKeyGenerator } from '../../src/tokens/FakeApiKeyGenerator.js';
import { AwsIamKeyGenerator } from '../../src/tokens/AwsIamKeyGenerator.js';
import type { ITokenGenerator, GeneratedToken } from '../../src/tokens/ITokenGenerator.js';

describe('TokenGeneratorFactory', () => {
  it('generates AWS_IAM_KEY tokens', () => {
    const token = TokenGeneratorFactory.generate('AWS_IAM_KEY');
    expect(token.secret).toMatch(/^AKIA[A-Z0-9]{20}$/);
    expect(token.display).toContain('AWS_ACCESS_KEY_ID=');
    expect(token.metadata?.mock).toBe(true);
  });

  it('generates FAKE_API_KEY tokens', () => {
    const token = TokenGeneratorFactory.generate('FAKE_API_KEY');
    expect(token.secret).toMatch(/^CNRY_[a-f0-9]{32}$/);
    expect(token.display).toBe(`API_KEY=${token.secret}`);
    expect(token.metadata?.prefix).toBe('CNRY');
  });

  it('throws error for unknown token type', () => {
    expect(() => TokenGeneratorFactory.generate('UNKNOWN_TYPE')).toThrow(
      'Unknown token type: "UNKNOWN_TYPE"',
    );
  });

  it('lists available token types', () => {
    const types = TokenGeneratorFactory.getAvailableTypes();
    expect(types).toContain('AWS_IAM_KEY');
    expect(types).toContain('FAKE_API_KEY');
    expect(types.length).toBeGreaterThanOrEqual(2);
  });

  it('produces unique tokens on repeated generation', () => {
    const token1 = TokenGeneratorFactory.generate('FAKE_API_KEY');
    const token2 = TokenGeneratorFactory.generate('FAKE_API_KEY');
    expect(token1.secret).not.toBe(token2.secret);
  });
});

describe('Token Generator Extensibility', () => {
  // Custom test generator for DB credentials
  class DbCredentialGenerator implements ITokenGenerator {
    readonly type = 'DB_CREDENTIAL';

    generate(): GeneratedToken {
      const username = `canary_user_${Math.random().toString(36).slice(2, 10)}`;
      const password = `pwd_${Math.random().toString(36).slice(2, 18)}`;
      return {
        secret: password,
        display: `postgresql://${username}:${password}@localhost:5432/honeypot`,
        metadata: {
          username,
          database: 'honeypot',
          port: 5432,
        },
      };
    }
  }

  beforeEach(() => {
    // Clean up custom registrations between tests
    // Note: Factory doesn't expose unregister, so we test registration fresh each time
  });

  it('allows registration of custom token generators', () => {
    const customGen = new DbCredentialGenerator();
    TokenGeneratorFactory.register('DB_CREDENTIAL', customGen);

    const token = TokenGeneratorFactory.generate('DB_CREDENTIAL');
    expect(token.display).toContain('postgresql://');
    expect(token.metadata?.username).toBeDefined();
    expect(token.metadata?.database).toBe('honeypot');
  });

  it('prevents registration with mismatched type', () => {
    const customGen = new DbCredentialGenerator();
    expect(() => TokenGeneratorFactory.register('WRONG_TYPE', customGen)).toThrow(
      'Generator type mismatch',
    );
  });

  it('demonstrates open/closed principle - new types without core changes', () => {
    // Prove that adding a new token type doesn't require modifying detection/core code
    class JwtTokenGenerator implements ITokenGenerator {
      readonly type = 'JWT_TOKEN';

      generate(): GeneratedToken {
        const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString(
          'base64url',
        );
        const payload = Buffer.from(JSON.stringify({ sub: 'canary', iat: Date.now() })).toString(
          'base64url',
        );
        const signature = 'fake_signature_' + Math.random().toString(36).slice(2, 12);
        const jwt = `${header}.${payload}.${signature}`;

        return {
          secret: jwt,
          display: `Authorization: Bearer ${jwt}`,
          metadata: { type: 'JWT', algorithm: 'HS256' },
        };
      }
    }

    TokenGeneratorFactory.register('JWT_TOKEN', new JwtTokenGenerator());
    const token = TokenGeneratorFactory.generate('JWT_TOKEN');

    expect(token.secret).toContain('.');
    expect(token.display).toContain('Bearer');
    expect(token.metadata?.algorithm).toBe('HS256');

    // Verify it's in available types
    expect(TokenGeneratorFactory.getAvailableTypes()).toContain('JWT_TOKEN');
  });
});

describe('FakeApiKeyGenerator', () => {
  it('generates tokens with correct format', () => {
    const gen = new FakeApiKeyGenerator();
    const token = gen.generate();

    expect(token.secret).toMatch(/^CNRY_[a-f0-9]{32}$/);
    expect(token.display).toContain('API_KEY=');
    expect(token.metadata?.format).toBe('hex');
  });

  it('generates unique secrets', () => {
    const gen = new FakeApiKeyGenerator();
    const secrets = new Set([gen.generate().secret, gen.generate().secret, gen.generate().secret]);
    expect(secrets.size).toBe(3);
  });
});

describe('AwsIamKeyGenerator', () => {
  it('generates AWS-format access keys', () => {
    const gen = new AwsIamKeyGenerator();
    const token = gen.generate();

    expect(token.secret).toMatch(/^AKIA[A-Z0-9]{20}$/);
    expect(token.display).toContain('AWS_ACCESS_KEY_ID=');
    expect(token.display).toContain('AWS_SECRET_ACCESS_KEY=');
    expect(token.metadata?.accessKeyId).toBe(token.secret);
  });

  it('includes secret access key in metadata', () => {
    const gen = new AwsIamKeyGenerator();
    const token = gen.generate();

    expect(token.metadata?.secretAccessKey).toBeDefined();
    expect(typeof token.metadata?.secretAccessKey).toBe('string');
  });
});
