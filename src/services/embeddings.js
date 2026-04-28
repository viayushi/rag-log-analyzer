import { getConfig } from "../config/index.js";
import { getGeminiClient } from "./gemini.js";

function compactParts(parts) {
  return parts
    .map((part) => String(part || "").trim())
    .filter(Boolean);
}

export function buildLogEmbeddingText(log) {
  const parts = compactParts([
    `application: ${log.application || log.service}`,
    `service: ${log.service || log.application}`,
    `level: ${log.level}`,
    log.subscriberId ? `subscriber: ${log.subscriberId}` : "",
    log.environment ? `environment: ${log.environment}` : "",
    log.exceptionFaultType ? `fault type: ${log.exceptionFaultType}` : "",
    log.exceptionErrorCode ? `error code: ${log.exceptionErrorCode}` : "",
    log.exceptionSource ? `exception source: ${log.exceptionSource}` : "",
    log.exceptionMessage ? `exception message: ${log.exceptionMessage}` : "",
    log.summary ? `summary: ${log.summary}` : "",
    log.message ? `message: ${log.message}` : "",
    log.rawSource?.Http?.Method ? `http method: ${log.rawSource.Http.Method}` : "",
    log.rawSource?.Http?.Route ? `route: ${log.rawSource.Http.Route}` : "",
    log.rawSource?.Http?.StatusCode ? `status code: ${log.rawSource.Http.StatusCode}` : "",
  ]);

  return parts.join("\n");
}

export function buildQueryEmbeddingText(query, resolvedFilters = {}) {
  const parts = compactParts([
    `user query: ${query}`,
    resolvedFilters.service ? `application filter: ${resolvedFilters.service}` : "",
    resolvedFilters.level ? `severity filter: ${resolvedFilters.level}` : "",
    resolvedFilters.subscriberId ? `subscriber filter: ${resolvedFilters.subscriberId}` : "",
    resolvedFilters.timeRange?.label ? `time range: ${resolvedFilters.timeRange.label}` : "",
  ]);

  return parts.join("\n");
}

function buildEmbeddingRequestOptions(config, input) {
  return {
    model: config.geminiEmbeddingModel,
    content: { parts: [{ text: Array.isArray(input) ? input.join("\n") : input }] },
  };
}

export async function embedTexts(texts, deps = {}) {
  const config = deps.config || getConfig();
  const geminiClient = deps.geminiClient || getGeminiClient(config);
  const normalizedTexts = texts.map((text) => String(text || "").trim()).filter(Boolean);

  if (normalizedTexts.length === 0) {
    return [];
  }

  const embeddings = [];
  for (const text of normalizedTexts) {
    const response = await geminiClient.embedContent({
      model: config.geminiEmbeddingModel,
      content: { parts: [{ text }] },
    });
    embeddings.push(response.embedding.values);
  }

  return embeddings;
}

export async function embedQueryText(query, resolvedFilters = {}, deps = {}) {
  const [embedding] = await embedTexts([buildQueryEmbeddingText(query, resolvedFilters)], deps);
  return embedding || null;
}

export async function embedLogDocuments(logs, deps = {}) {
  const normalizedLogs = logs.map((log) => ({
    ...log,
    embeddingText: buildLogEmbeddingText(log),
  }));
  const embeddings = await embedTexts(
    normalizedLogs.map((log) => log.embeddingText),
    deps,
  );

  return normalizedLogs.map((log, index) => ({
    ...log,
    embedding: embeddings[index] || null,
  }));
}
