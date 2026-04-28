const LEVEL_ALIASES = {
  critical: "critical",
  crit: "critical",
  error: "error",
  errors: "error",
  fail: "error",
  failed: "error",
  failing: "error",
  failure: "error",
  failures: "error",
  warning: "warning",
  warnings: "warning",
  warn: "warning",
  info: "info",
  debug: "debug",
};

const STOP_WORDS = new Set([
  "a",
  "an",
  "any",
  "are",
  "for",
  "from",
  "get",
  "happened",
  "happening",
  "how",
  "in",
  "is",
  "issues",
  "logs",
  "many",
  "me",
  "occurred",
  "of",
  "on",
  "account",
  "accounts",
  "recent",
  "recently",
  "service",
  "services",
  "show",
  "subscriber",
  "subscriberid",
  "tell",
  "the",
  "there",
  "today",
  "what",
  "why",
  "with",
]);

function startOfToday(now) {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function startOfYesterday(now) {
  const today = startOfToday(now);
  return new Date(today.getTime() - 24 * 60 * 60 * 1000);
}

export function resolveTimeRange(timeRange, nowInput = new Date()) {
  const now = nowInput instanceof Date ? nowInput : new Date(nowInput);
  const key = String(timeRange || "").trim().toLowerCase();

  if (!key) {
    return null;
  }

  const presets = {
    last_15m: {
      gte: new Date(now.getTime() - 15 * 60 * 1000).toISOString(),
      lte: now.toISOString(),
      label: "Last 15 minutes",
    },
    last_1h: {
      gte: new Date(now.getTime() - 60 * 60 * 1000).toISOString(),
      lte: now.toISOString(),
      label: "Last hour",
    },
    last_6h: {
      gte: new Date(now.getTime() - 6 * 60 * 60 * 1000).toISOString(),
      lte: now.toISOString(),
      label: "Last 6 hours",
    },
    last_24h: {
      gte: new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString(),
      lte: now.toISOString(),
      label: "Last 24 hours",
    },
    today: {
      gte: startOfToday(now).toISOString(),
      lte: now.toISOString(),
      label: "Today",
    },
    yesterday: {
      gte: startOfYesterday(now).toISOString(),
      lte: startOfToday(now).toISOString(),
      label: "Yesterday",
    },
    last_7d: {
      gte: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString(),
      lte: now.toISOString(),
      label: "Last 7 days",
    },
  };

  return presets[key] || null;
}

export function inferServiceFromQuery(query) {
  const rawQuery = String(query || "").trim();
  if (!rawQuery) {
    return null;
  }

  const patterns = [
    /\b([a-z0-9_-]+)\s+services?\b/i,
    /\bservices?\s+([a-z0-9_-]+)\b/i,
    /\bin\s+([a-z0-9_-]+)\b/i,
    /\bfor\s+([a-z0-9_-]+)\b/i,
  ];

  for (const pattern of patterns) {
    const match = rawQuery.match(pattern);
    const candidate = String(match?.[1] || "").trim();
    if (candidate && !STOP_WORDS.has(candidate.toLowerCase())) {
      return candidate;
    }
  }

  return null;
}

export function inferLevelFromQuery(query) {
  const normalized = String(query || "").toLowerCase();
  const tokens = normalized.match(/[a-z]+/g) || [];

  for (const token of tokens) {
    if (LEVEL_ALIASES[token]) {
      return LEVEL_ALIASES[token];
    }
  }

  return null;
}

export function inferSubscriberIdFromQuery(query) {
  const normalized = String(query || "").toLowerCase();
  if (!normalized) {
    return null;
  }

  const patterns = [
    /\bsubscriber(?:id)?\s*[:#-]?\s*(\d{3,})\b/,
    /\bsubscriber\s+(\d{3,})\b/,
  ];

  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (match?.[1]) {
      return match[1];
    }
  }

  return null;
}

export function inferTimeRangeFromQuery(query, nowInput = new Date()) {
  const normalized = String(query || "").toLowerCase();

  if (!normalized) {
    return null;
  }

  if (normalized.includes("last hour") || normalized.includes("past hour")) {
    return resolveTimeRange("last_1h", nowInput);
  }

  if (normalized.includes("last 24 hours") || normalized.includes("past 24 hours")) {
    return resolveTimeRange("last_24h", nowInput);
  }

  if (normalized.includes("last 7 days") || normalized.includes("past week")) {
    return resolveTimeRange("last_7d", nowInput);
  }

  if (normalized.includes("today")) {
    return resolveTimeRange("today", nowInput);
  }

  if (normalized.includes("yesterday")) {
    return resolveTimeRange("yesterday", nowInput);
  }

  if (normalized.includes("recent") || normalized.includes("recently")) {
    return resolveTimeRange("last_6h", nowInput);
  }

  return null;
}

export function resolveFilters(query, filters = {}, nowInput = new Date()) {
  const explicitTimeRange = resolveTimeRange(filters.timeRange, nowInput);
  const inferredTimeRange = inferTimeRangeFromQuery(query, nowInput);

  const explicitService = String(filters.service || "").trim();
  const explicitLevel = String(filters.level || "").trim().toLowerCase();
  const explicitSubscriberId = String(filters.subscriberId || "").trim();
  const inferredService = inferServiceFromQuery(query);
  const inferredLevel = inferLevelFromQuery(query);
  const inferredSubscriberId = inferSubscriberIdFromQuery(query);

  return {
    service: explicitService || inferredService || null,
    level: explicitLevel || inferredLevel || null,
    subscriberId: explicitSubscriberId || inferredSubscriberId || null,
    timeRange: explicitTimeRange || inferredTimeRange,
    inferred: {
      service: !explicitService && Boolean(inferredService),
      level: !explicitLevel && Boolean(inferredLevel),
      subscriberId: !explicitSubscriberId && Boolean(inferredSubscriberId),
      timeRange: !explicitTimeRange && Boolean(inferredTimeRange),
    },
  };
}

export function buildSearchText(query, resolvedFilters) {
  const normalized = String(query || "").toLowerCase();
  if (!normalized) {
    return "";
  }

  const tokens = normalized.match(/[a-z0-9_-]+/g) || [];
  const normalizedService = String(resolvedFilters.service || "").toLowerCase();
  const filteredTokens = tokens.filter((token) => {
    if (STOP_WORDS.has(token)) {
      return false;
    }

    if (LEVEL_ALIASES[token]) {
      return false;
    }

    if (normalizedService && token === normalizedService) {
      return false;
    }

    if (resolvedFilters.subscriberId && token === resolvedFilters.subscriberId) {
      return false;
    }

    if (["last", "past", "hour", "hours", "day", "days", "week", "weeks", "minute", "minutes"].includes(token)) {
      return false;
    }

    return true;
  });

  return filteredTokens.join(" ").trim();
}
