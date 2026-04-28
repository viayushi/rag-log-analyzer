import { getMissingConfig } from "../config/index.js";
import { runRagQuery } from "../services/rag.js";

function printList(title, values) {
  console.log(`${title}:`);
  if (!values.length) {
    console.log("  - None");
    return;
  }

  for (const value of values) {
    console.log(`  - ${value}`);
  }
}

async function main() {
  const userQuery = process.argv.slice(2).join(" ").trim() || "Show validation errors for subscriber 89661";
  const missing = getMissingConfig({ requireGemini: true });

  if (missing.length > 0) {
    console.error(`Missing required configuration: ${missing.join(", ")}`);
    process.exit(1);
  }

  try {
    console.log(`Query: ${userQuery}`);
    const result = await runRagQuery({ query: userQuery });

    console.log("\nAnalysis summary:");
    console.log(result.answer.summary);
    console.log(`\nSeverity: ${result.answer.severity_assessment}`);
    console.log(`Applications: ${result.answer.services_involved.join(", ") || "None"}`);

    printList("Likely causes", result.answer.likely_causes);
    printList("Recommended next steps", result.answer.recommended_next_steps);

    console.log(`\nEvidence (${result.evidence.length} logs):`);
    for (const log of result.evidence) {
      console.log(`- [${log.level}] ${log.application || log.service} subscriber ${log.subscriberId || "unknown"} @ ${log.timestamp || "no timestamp"} :: ${log.summary || log.message}`);
    }
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}

main();
