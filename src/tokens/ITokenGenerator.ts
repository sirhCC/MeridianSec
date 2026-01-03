/**
 * Token generator abstraction for extensibility.
 * Supports multiple canary token types (AWS IAM keys, API keys, DB credentials, etc.)
 * with a uniform interface for generation and rotation.
 */

export interface TokenMetadata {
  /** Additional descriptive info about the token (e.g., key pair ID, endpoint, etc.) */
  [key: string]: string | number | boolean;
}

export interface GeneratedToken {
  /** The raw secret value (e.g., access key, password). Should be securely handled. */
  secret: string;
  /** Human-readable display format (e.g., "AWS_ACCESS_KEY_ID=AKIA...") */
  display: string;
  /** Additional metadata for placement context or detection correlation */
  metadata?: TokenMetadata;
}

/**
 * Token generator interface. Implementations must be stateless for each call.
 */
export interface ITokenGenerator {
  /** Unique identifier matching CanaryType */
  readonly type: string;

  /**
   * Generate a new canary token.
   * @returns Generated token with secret, display format, and optional metadata
   */
  generate(): GeneratedToken;
}
