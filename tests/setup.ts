// Global test setup - runs before all tests
// Sets a default DATABASE_URL so Prisma client can initialize

// Set default test database URL if not already set
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = 'file:./data/test-default.db';
}
