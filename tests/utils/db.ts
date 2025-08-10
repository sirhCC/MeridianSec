import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

// Ensures the Prisma schema is applied to the current test database.
// Designed for ephemeral SQLite DBs referenced by process.env.DATABASE_URL.
export function ensureTestDb() {
  // Always start from a clean SQLite file so schema changes (column removals) are reflected.
  const dbUrl = process.env.DATABASE_URL;
  const match = dbUrl && /file:(.*)/.exec(dbUrl);
  if (match && fs.existsSync(match[1])) {
    try {
      fs.unlinkSync(match[1]);
    } catch (e) {
      throw new Error('Failed to remove existing test DB file: ' + (e as Error).message);
    }
  }
  const migrationsDir = path.resolve(process.cwd(), 'prisma', 'migrations');
  const hasMigrations = fs.existsSync(migrationsDir) && fs.readdirSync(migrationsDir).length > 0;
  try {
    if (hasMigrations) {
      execSync('npx prisma migrate deploy', { stdio: 'ignore', env: process.env });
    } else {
      execSync('npx prisma db push --accept-data-loss', { stdio: 'ignore', env: process.env });
    }
  } catch (err) {
    throw new Error('Failed to apply Prisma schema/migrations for test DB: ' + (err as Error).message);
  }
}
