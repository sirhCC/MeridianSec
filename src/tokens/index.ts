/**
 * Token generation module - provides extensible token generators for different canary types.
 * Add new token types by implementing ITokenGenerator and registering with TokenGeneratorFactory.
 */

export { ITokenGenerator, GeneratedToken, TokenMetadata } from './ITokenGenerator.js';
export { TokenGeneratorFactory } from './TokenGeneratorFactory.js';
export { FakeApiKeyGenerator } from './FakeApiKeyGenerator.js';
export { AwsIamKeyGenerator } from './AwsIamKeyGenerator.js';
