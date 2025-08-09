import { execSync } from 'child_process';

// Ensures the Prisma schema is applied to the current test database.
// Designed for ephemeral SQLite DBs referenced by process.env.DATABASE_URL.
export function ensureTestDb() {
  try {
    execSync('npx prisma db push --skip-generate', {
      stdio: 'ignore',
      env: process.env,
    });
  } catch (err) {
    throw new Error('Failed to push Prisma schema for test DB: ' + (err as Error).message);
  }
}
