import { clampTopK, getConfig, getMissingConfigFromConfig } from "../config/index.js";
import { getElasticsearchHealth, getLogMetadata, retrieveLogs } from "./elasticsearch.js";
import { analyzeLogs } from "./llm.js";

export function createNoEvidenceAnswer(query) {
  return {
    summary: `No matching log evidence was found for "${query}".`,
    likely_causes: [
      "No documents in the selected index matched the query and filters.",
      "The issue may be outside the selected time range or service scope.",
    ],
    services_involved: [],
    severity_assessment: "unknown",
    evidence_log_ids: [],
    recommended_next_steps: [
      "Broaden the time range or remove filters.",
      "Try a more specific service name, keyword, or severity level.",
    ],
  };
}

export async function runRagQuery({ query, filters = {}, topK }, deps = {}) {
  const config = getConfig();
  const runtimeConfig = deps.config || config;
  const missing = getMissingConfigFromConfig(runtimeConfig, { requireGemini: true });

  if (missing.length > 0) {
    throw new Error(`Missing required configuration: ${missing.join(", ")}`);
  }

  const resolvedTopK = clampTopK(topK, runtimeConfig.defaultTopK);
  const retrievalResult = await retrieveLogs(
    {
      query,
      filters,
      topK: resolvedTopK,
    },
    deps,
  );

  if (retrievalResult.evidence.length === 0) {
    return {
      answer: createNoEvidenceAnswer(query),
      evidence: [],
      retrievalMeta: retrievalResult.retrievalMeta,
    };
  }

  const answer = await analyzeLogs(query, retrievalResult.evidence, {
    ...deps,
    topK: resolvedTopK,
  });

  return {
    answer,
    evidence: retrievalResult.evidence,
    retrievalMeta: retrievalResult.retrievalMeta,
  };
}

export async function runRetrievalOnly({ query, filters = {}, topK }, deps = {}) {
  const config = getConfig();
  const runtimeConfig = deps.config || config;
  const missing = getMissingConfigFromConfig(runtimeConfig);

  if (missing.length > 0) {
    throw new Error(`Missing required configuration: ${missing.join(", ")}`);
  }

  return retrieveLogs(
    {
      query,
      filters,
      topK: clampTopK(topK, runtimeConfig.defaultTopK),
    },
    deps,
  );
}

export async function getSystemHealth(deps = {}) {
  const config = deps.config || getConfig();
  const missing = getMissingConfigFromConfig(config, { requireGemini: true });

  const elastic = await getElasticsearchHealth(deps);
  const metadata = elastic.connected && elastic.index?.ready ? await getLogMetadata({}, deps) : { services: [], levels: [] };
  const status = missing.length > 0
    ? "error"
    : !elastic.connected
      ? "error"
      : elastic.index?.ready
        ? "ok"
        : "degraded";

  return {
    status,
    missingConfig: missing,
    config: {
      elasticUrl: config.elasticUrl || null,
      elasticIndex: config.elasticIndex,
      elasticAuthMode: config.elasticAuthMode,
      geminiModel: config.geminiModel,
      hasGeminiKey: Boolean(config.geminiApiKey),
      hasElasticApiKey: Boolean(config.elasticApiKey),
      fieldMap: config.fieldMap,
    },
    elastic,
    metadata,
  };
}
