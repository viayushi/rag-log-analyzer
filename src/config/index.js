import dotenv from "dotenv";

dotenv.config({ quiet: true });

export const DEFAULT_FIELD_MAP = {
  message: "message",
  service: "service",
  level: "level",
  timestamp: "timestamp",
  subscriberId: "subscriberId",
  embedding: "embedding",
  embeddingText: "embeddingText",
};

export const DEFAULT_TOP_K = 12;
export const MAX_TOP_K = 20;
export const DEFAULT_PORT = 3000;
export const DEFAULT_EMBEDDING_MODEL = "text-embedding-3-small";
export const DEFAULT_EMBEDDING_DIMENSIONS = 1536;

function parseInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function getConfig() {
  return {
    geminiApiKey: process.env.GEMINI_API_KEY || "",
    geminiModel: process.env.GEMINI_MODEL || "gemini-2.0-flash",
    geminiEmbeddingModel: process.env.GEMINI_EMBEDDING_MODEL || "models/embedding-001",
    geminiEmbeddingDimensions: parseInteger(process.env.GEMINI_EMBEDDING_DIMENSIONS, DEFAULT_EMBEDDING_DIMENSIONS),
    elasticUrl: process.env.ELASTIC_URL || "",
    elasticApiKey: process.env.ELASTIC_API_KEY || "",
    elasticAuthMode: process.env.ELASTIC_AUTH_MODE || "auto",
    elasticIndex: process.env.ELASTIC_INDEX || "logs",
    fieldMap: {
      message: process.env.LOG_MESSAGE_FIELD || DEFAULT_FIELD_MAP.message,
      service: process.env.LOG_SERVICE_FIELD || DEFAULT_FIELD_MAP.service,
      level: process.env.LOG_LEVEL_FIELD || DEFAULT_FIELD_MAP.level,
      timestamp: process.env.LOG_TIMESTAMP_FIELD || DEFAULT_FIELD_MAP.timestamp,
      subscriberId: process.env.LOG_SUBSCRIBER_FIELD || DEFAULT_FIELD_MAP.subscriberId,
      embedding: process.env.LOG_EMBEDDING_FIELD || DEFAULT_FIELD_MAP.embedding,
      embeddingText: process.env.LOG_EMBEDDING_TEXT_FIELD || DEFAULT_FIELD_MAP.embeddingText,
    },
    port: parseInteger(process.env.PORT, DEFAULT_PORT),
    defaultTopK: parseInteger(process.env.TOP_K, DEFAULT_TOP_K),
  };
}

export function clampTopK(requestedTopK, fallback = DEFAULT_TOP_K) {
  const parsed = Number.parseInt(requestedTopK, 10);
  if (!Number.isFinite(parsed)) {
    return Math.min(Math.max(fallback, 1), MAX_TOP_K);
  }

  return Math.min(Math.max(parsed, 1), MAX_TOP_K);
}

export function getMissingConfig({ requireGemini = false } = {}) {
  return getMissingConfigFromConfig(getConfig(), { requireGemini });
}

export function getMissingConfigFromConfig(config, { requireGemini = false } = {}) {
  const missing = [];

  if (!config.elasticUrl) {
    missing.push("ELASTIC_URL");
  }

  if (config.elasticAuthMode === "api_key" && !config.elasticApiKey) {
    missing.push("ELASTIC_API_KEY");
  }

  if (requireGemini && !config.geminiApiKey) {
    missing.push("GEMINI_API_KEY");
  }

  return missing;
}

export function getPublicConfigSummary() {
  const config = getConfig();

  return {
    elasticUrl: config.elasticUrl || null,
    elasticIndex: config.elasticIndex,
    elasticAuthMode: config.elasticAuthMode,
    geminiModel: config.geminiModel,
    geminiEmbeddingModel: config.geminiEmbeddingModel,
    geminiEmbeddingDimensions: config.geminiEmbeddingDimensions,
    port: config.port,
    fieldMap: config.fieldMap,
    hasGeminiKey: Boolean(config.geminiApiKey),
    hasElasticApiKey: Boolean(config.elasticApiKey),
  };
}
