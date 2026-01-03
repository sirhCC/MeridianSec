import type { ITokenGenerator } from './ITokenGenerator.js';
import { FakeApiKeyGenerator } from './FakeApiKeyGenerator.js';
import { AwsIamKeyGenerator } from './AwsIamKeyGenerator.js';

/**
 * Token generator factory registry.
 * Uses a registry pattern to support pluggable token generators without modifying core code.
 */
export class TokenGeneratorFactory {
  private static readonly registry = new Map<string, ITokenGenerator>([
    ['AWS_IAM_KEY', new AwsIamKeyGenerator()],
    ['FAKE_API_KEY', new FakeApiKeyGenerator()],
  ]);

  /**
   * Register a custom token generator.
   * Allows extension without modifying factory code.
   */
  static register(type: string, generator: ITokenGenerator): void {
    if (generator.type !== type) {
      throw new Error(`Generator type mismatch: expected "${type}", got "${generator.type}"`);
    }
    this.registry.set(type, generator);
  }

  /**
   * Get a token generator by type.
   * @throws Error if type is not registered
   */
  static getGenerator(type: string): ITokenGenerator {
    const generator = this.registry.get(type);
    if (!generator) {
      const available = Array.from(this.registry.keys()).join(', ');
      throw new Error(`Unknown token type: "${type}". Available types: ${available}`);
    }
    return generator;
  }

  /**
   * Generate a token for the given type.
   * Convenience method that looks up and invokes the generator.
   */
  static generate(type: string) {
    return this.getGenerator(type).generate();
  }

  /**
   * Get all registered token types.
   */
  static getAvailableTypes(): string[] {
    return Array.from(this.registry.keys());
  }
}
