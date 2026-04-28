import { getMissingConfig } from "../config/index.js";
import { clearLogs, seedLogs } from "../services/elasticsearch.js";

async function main() {
  const missing = getMissingConfig();
  if (missing.length > 0) {
    console.error(`Missing required configuration: ${missing.join(", ")}`);
    process.exit(1);
  }

  try {
    console.log("Initializing log index...");
    await clearLogs();
    const inserted = await seedLogs();
    console.log(`Database ready. Seeded ${inserted} logs.`);
  } catch (error) {
    console.error(`Initialization failed: ${error.message}`);
    process.exit(1);
  }
}

main();
