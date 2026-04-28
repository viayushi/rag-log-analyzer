import { clampTopK, getConfig } from "../config/index.js";
import { getGeminiClient } from "./gemini.js";

function stripCodeFence(content) {
  return String(content || "")
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function sanitizeSeverity(value) {
  const severity = String(value || "").toLowerCase();
  const supported = new Set(["unknown", "info", "warning", "error", "critical"]);
  return supported.has(severity) ? severity : "unknown";
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => String(item || "").trim())
    .filter(Boolean);
}

function capitalizeSentence(value) {
  const text = String(value || "").trim();
  if (!text) {
    return "";
  }

  return text.charAt(0).toUpperCase() + text.slice(1);
}

function getHighestSeverity(logs) {
  const severityRank = new Map([
    ["unknown", 0],
    ["info", 1],
    ["warning", 2],
    ["error", 3],
    ["critical", 4],
  ]);

  return logs.reduce((current, log) => {
    const candidate = String(log.level || "unknown").toLowerCase();
    return (severityRank.get(candidate) || 0) > (severityRank.get(current) || 0) ? candidate : current;
  }, "unknown");
}

function getFallbackReason(error) {
  const status = error?.status || error?.statusCode || error?.code;
  const message = String(error?.message || "").toLowerCase();

  if (status === 429 || message.includes("quota")) {
    return "Gemini API quota is unavailable";
  }

  if (message.includes("connection")) {
    return "Gemini API is unreachable";
  }

  return "Gemini analysis is unavailable";
}

function buildFallbackNextSteps(logs, reason) {
  const messages = logs.map((log) => String(log.message || "").toLowerCase());
  const steps = new Set([
    "Inspect the highlighted evidence logs and correlate them with recent deploys or infrastructure changes.",
  ]);

  if (messages.some((message) => message.includes("503") || message.includes("gateway"))) {
    steps.add("Check the upstream dependency or gateway returning 5xx responses.");
  }

  if (messages.some((message) => message.includes("timeout") || message.includes("connection pool"))) {
    steps.add("Review database connectivity, latency, and pool saturation.");
  }

  if (messages.some((message) => message.includes("null reference") || message.includes("exception"))) {
    steps.add("Inspect recent application changes around the failing code path.");
  }

  steps.add(`${reason}; restore API access for model-generated reasoning.`);
  return [...steps];
}

function getDistinctSubscriberIds(logs) {
  return [...new Set(
    logs
      .map((log) => String(log.subscriberId || "").trim())
      .filter(Boolean),
  )];
}

function isCountQuery(query) {
  return /\b(how many|count|number of)\b/i.test(String(query || ""));
}

function isSubscriberScopedQuery(query) {
  return /\b(account|accounts|subscriber|subscribers)\b/i.test(String(query || ""));
}

function buildFallbackAnalysis(query, logs, error) {
  const services = [...new Set(logs.map((log) => log.service).filter(Boolean))];
  const severity = getHighestSeverity(logs);
  const uniqueMessages = [...new Set(logs.map((log) => String(log.message || "").trim()).filter(Boolean))];
  const leadMessages = uniqueMessages.slice(0, 2).map((message) => `"${message}"`).join(" and ");
  const reason = getFallbackReason(error);
  const distinctSubscriberIds = getDistinctSubscriberIds(logs);
  const wantsSubscriberCount = isCountQuery(query) && isSubscriberScopedQuery(query) && distinctSubscriberIds.length > 0;
  const summary = wantsSubscriberCount
    ? `${reason}. Local fallback analysis for "${query}" found ${distinctSubscriberIds.length} affected subscriber account(s) in ${services.join(", ") || "the selected scope"}: ${distinctSubscriberIds.join(", ")}. These results came from ${logs.length} matching log(s) at ${severity} severity.`
    : `${reason}. Local fallback analysis for "${query}" found ${logs.length} matching log(s) at ${severity} severity${leadMessages ? `, including ${leadMessages}` : ""}.`;

  return {
    summary,
    likely_causes: uniqueMessages.slice(0, 3).map(capitalizeSentence),
    services_involved: services,
    severity_assessment: severity,
    evidence_log_ids: logs.slice(0, 3).map((log) => log.id),
    recommended_next_steps: buildFallbackNextSteps(logs, reason),
  };
}

function normalizeAnalysisResult(rawResult, logs, query) {
  const logIds = new Set(logs.map((log) => log.id));
  const evidenceIds = normalizeStringArray(rawResult.evidence_log_ids).filter((id) => logIds.has(id));
  const services = normalizeStringArray(rawResult.services_involved);

  return {
    summary: String(rawResult.summary || `Analysis completed for "${query}".`).trim(),
    likely_causes: normalizeStringArray(rawResult.likely_causes),
    services_involved: services.length > 0 ? services : [...new Set(logs.map((log) => log.service).filter(Boolean))],
    severity_assessment: sanitizeSeverity(rawResult.severity_assessment),
    evidence_log_ids: evidenceIds.length > 0 ? evidenceIds : logs.slice(0, 3).map((log) => log.id),
    recommended_next_steps: normalizeStringArray(rawResult.recommended_next_steps),
  };
}

function parseStructuredContent(content) {
  const stripped = stripCodeFence(content);
  return JSON.parse(stripped);
}

export async function analyzeLogs(query, logs, deps = {}) {
  if (!logs || logs.length === 0) {
    throw new Error("No logs provided for analysis.");
  }

  const config = deps.config || getConfig();
  const geminiClient = deps.geminiClient || getGeminiClient();
  const boundedLogs = logs.slice(0, clampTopK(deps.topK, config.defaultTopK));
  const promptPayload = {
    user_query: query,
    retrieved_logs: boundedLogs,
    instructions: [
      "Use only the supplied logs as evidence.",
      "Keep the explanation concise and operationally useful.",
      "Return strict JSON with the exact keys requested.",
      "Only include evidence_log_ids that exist in the retrieved logs.",
    ],
  };

  try {
    const model = geminiClient.getGenerativeModel({ model: config.geminiModel });
    const systemInstruction = "You are an incident analyst for distributed systems. Return JSON with these keys only: summary, likely_causes, services_involved, severity_assessment, evidence_log_ids, recommended_next_steps.";
    
    const response = await model.generateContent({
      contents: [
        {
          role: "user",
          parts: [
            {
              text: `${systemInstruction}\n\n${JSON.stringify(promptPayload, null, 2)}`,
            },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.2,
      },
    });

    const content = response.response.text();
    if (!content) {
      throw new Error("No response received from the language model.");
    }

    try {
      return normalizeAnalysisResult(parseStructuredContent(content), boundedLogs, query);
    } catch {
      return normalizeAnalysisResult(
        {
          summary: stripCodeFence(content),
          likely_causes: ["The model returned an unstructured response."],
          services_involved: boundedLogs.map((log) => log.service),
          severity_assessment: "unknown",
          evidence_log_ids: boundedLogs.slice(0, 3).map((log) => log.id),
          recommended_next_steps: ["Review the retrieved logs directly and retry the request."],
        },
        boundedLogs,
        query,
      );
    }
  } catch (error) {
    return buildFallbackAnalysis(query, boundedLogs, error);
  }
}

export { buildFallbackAnalysis, normalizeAnalysisResult, parseStructuredContent, stripCodeFence };
