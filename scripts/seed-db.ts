import { config as loadEnv } from 'dotenv';

loadEnv({ path: '.env.local' });
loadEnv();

import { ensureDatabase, getDbFilePath, getStats } from '../lib/db';

async function main() {
  ensureDatabase();
  const stats = await getStats();
  console.log(`SQLite ready (${getDbFilePath()}): ${stats.settings} settings, ${stats.events} events, ${stats.mufrodat} mufrodat, ${stats.ticker} ticker items.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
