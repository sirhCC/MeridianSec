import { buildServer } from './api/server.js';
import { loadConfig } from './config/index.js';
import { getLogger } from './utils/logging.js';

async function main() {
  const cfg = loadConfig();
  const server = await buildServer();
  const port = Number(process.env.PORT || 3000);
  await server.listen({ port, host: '0.0.0.0' });
  getLogger().info({ port, envDb: cfg.database.url }, 'Server started');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
