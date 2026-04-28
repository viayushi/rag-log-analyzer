import { Client } from "@elastic/elasticsearch";

import { DEFAULT_FIELD_MAP, getConfig } from "../config/index.js";
import { embedLogDocuments, embedQueryText } from "./embeddings.js";
import { buildSearchText, resolveFilters } from "./retrieval.js";

let cachedClient = null;
let cachedClientKey = "";

function getValueAtPath(source, fieldPath) {
  return String(fieldPath || "")
    .split(".")
    .filter(Boolean)
    .reduce((value, segment) => (value && value[segment] !== undefined ? value[segment] : undefined), source);
}

function buildClientCacheKey(config) {
  return JSON.stringify({
    elasticUrl: config.elasticUrl,
    elasticApiKey: config.elasticApiKey,
  });
}

function getErrorMessage(error, fallback = "Unexpected Elasticsearch error.") {
  return error?.message || error?.meta?.body?.error?.reason || fallback;
}

function getEffectiveFieldMap(fieldMap = {}) {
  return {
    ...DEFAULT_FIELD_MAP,
    ...fieldMap,
  };
}

function getFirstDefinedValue(source, fieldPaths) {
  for (const fieldPath of fieldPaths) {
    const value = getValueAtPath(source, fieldPath);
    if (value !== undefined && value !== null && value !== "") {
      return value;
    }
  }

  return null;
}

function buildElasticAuth(config) {
  if (config.elasticAuthMode === "none") {
    return undefined;
  }

  const elasticApiKey = config.elasticApiKey;
  if (!elasticApiKey) {
    return undefined;
  }

  if (elasticApiKey.includes(":")) {
    const [id, apiKey] = elasticApiKey.split(":");
    if (id && apiKey) {
      return {
        apiKey: {
          id,
          api_key: apiKey,
        },
      };
    }
  }

  return {
    apiKey: elasticApiKey,
  };
}

async function ensureLogIndex(client, config) {
  try {
    await client.indices.create({
      index: config.elasticIndex,
      settings: {
        number_of_replicas: 0,
      },
      mappings: {
        properties: {
          message: { type: "text" },
          summary: { type: "text" },
          service: { type: "keyword" },
          application: { type: "keyword" },
          level: { type: "keyword" },
          timestamp: { type: "date" },
          subscriberId: { type: "keyword" },
          environment: { type: "keyword" },
          "@timestamp": { type: "date" },
          "@t": { type: "date" },
          "@m": { type: "text" },
          "@mt": { type: "text" },
          "@l": { type: "keyword" },
          Application: { type: "keyword" },
          Environment: { type: "keyword" },
          SubscriberId: { type: "keyword" },
          Summary: { type: "text" },
          UserEmail: { type: "keyword" },
          SubscriptionAge: { type: "integer" },
          host: {
            properties: {
              name: { type: "keyword" },
            },
          },
          agent: {
            properties: {
              type: { type: "keyword" },
              version: { type: "keyword" },
              id: { type: "keyword" },
              ephemeral_id: { type: "keyword" },
            },
          },
          trace: {
            properties: {
              id: { type: "keyword" },
              correlationId: { type: "keyword" },
            },
          },
          Http: {
            properties: {
              Method: { type: "keyword" },
              Url: { type: "keyword" },
              Route: { type: "keyword" },
              StatusCode: { type: "integer" },
              ElapsedMilliseconds: { type: "integer" },
            },
          },
          Exception: {
            properties: {
              ErrorCode: { type: "keyword" },
              ErrorMessage: { type: "text" },
              FaultType: { type: "keyword" },
              InnerException: {
                properties: {
                  Source: { type: "keyword" },
                  Message: { type: "text" },
                  Type: { type: "keyword" },
                },
              },
            },
          },
        },
      },
    });
  } catch (error) {
    if (error?.meta?.statusCode !== 400) {
      throw error;
    }
  }
}

export function createElasticsearchClient(configOverride = getConfig()) {
  const auth = buildElasticAuth(configOverride);
  const clientOptions = {
    node: configOverride.elasticUrl,
  };

  if (auth) {
    clientOptions.auth = auth;
  }

  return new Client(clientOptions);
}

export function getElasticsearchClient() {
  const config = getConfig();
  const cacheKey = buildClientCacheKey(config);

  if (!cachedClient || cachedClientKey !== cacheKey) {
    cachedClient = createElasticsearchClient(config);
    cachedClientKey = cacheKey;
  }

  return cachedClient;
}

function buildExactFilter(fieldName, value) {
  const normalizedValue = String(value || "").trim();
  const shouldClauses = [
    { term: { [`${fieldName}.keyword`]: normalizedValue } },
    { term: { [fieldName]: normalizedValue } },
    { match_phrase: { [fieldName]: normalizedValue } },
  ];

  if (/[a-z]/i.test(normalizedValue)) {
    shouldClauses.push({
      wildcard: {
        [fieldName]: {
          value: normalizedValue,
          case_insensitive: true,
        },
      },
    });
  }

  return {
    bool: {
      should: shouldClauses,
      minimum_should_match: 1,
    },
  };
}

function normalizeLogHit(hit, fieldMap) {
  const effectiveFieldMap = getEffectiveFieldMap(fieldMap);
  const source = hit._source || {};
  const service = getFirstDefinedValue(source, [
    effectiveFieldMap.service,
    "application",
    "Application",
    "service",
  ]) || "unknown";
  const level = String(getFirstDefinedValue(source, [
    effectiveFieldMap.level,
    "@l",
    "level",
  ]) || "unknown").toLowerCase();
  const subscriberId = getFirstDefinedValue(source, [
    effectiveFieldMap.subscriberId,
    "subscriberId",
    "SubscriberId",
  ]);

  return {
    id: hit._id,
    message: getFirstDefinedValue(source, [
      effectiveFieldMap.message,
      "@m",
      "summary",
      "Summary",
      "Exception.ErrorMessage",
    ]) || "",
    summary: getFirstDefinedValue(source, [
      "summary",
      "Summary",
      "@m",
      effectiveFieldMap.message,
    ]) || "",
    service,
    application: getFirstDefinedValue(source, ["application", "Application"]) || service,
    level,
    timestamp: getFirstDefinedValue(source, [
      effectiveFieldMap.timestamp,
      "@timestamp",
      "@t",
      "timestamp",
    ]) || null,
    subscriberId: subscriberId ? String(subscriberId) : null,
    environment: getFirstDefinedValue(source, ["environment", "Environment"]) || null,
    exceptionErrorCode: getFirstDefinedValue(source, ["Exception.ErrorCode"]),
    exceptionFaultType: getFirstDefinedValue(source, ["Exception.FaultType"]),
    exceptionSource: getFirstDefinedValue(source, ["Exception.InnerException.Source"]),
    exceptionMessage: getFirstDefinedValue(source, [
      "Exception.ErrorMessage",
      "Exception.InnerException.Message",
    ]),
    rawSource: source,
  };
}

function buildSearchRequest({ query, filters = {}, topK, config }) {
  const fieldMap = getEffectiveFieldMap(config.fieldMap);
  const resolvedFilters = resolveFilters(query, filters);
  const searchText = buildSearchText(query, resolvedFilters);
  const filterClauses = [];

  if (resolvedFilters.service) {
    filterClauses.push(buildExactFilter(fieldMap.service, resolvedFilters.service));
  }

  if (resolvedFilters.level) {
    filterClauses.push(buildExactFilter(fieldMap.level, resolvedFilters.level));
  }

  if (resolvedFilters.subscriberId) {
    filterClauses.push(buildExactFilter(fieldMap.subscriberId, resolvedFilters.subscriberId));
  }

  if (resolvedFilters.timeRange) {
    filterClauses.push({
      range: {
        [fieldMap.timestamp]: {
          gte: resolvedFilters.timeRange.gte,
          lte: resolvedFilters.timeRange.lte,
        },
      },
    });
  }

  const mustClauses = [];
  if (searchText) {
    mustClauses.push({
      match: {
        [fieldMap.message]: {
          query: searchText,
          operator: "and",
        },
      },
    });
  } else {
    mustClauses.push({ match_all: {} });
  }

  return {
    searchRequest: {
      index: config.elasticIndex,
      size: topK,
      track_total_hits: true,
      query: {
        bool: {
          must: mustClauses,
          filter: filterClauses,
        },
      },
      sort: [
        { _score: { order: "desc" } },
        {
          [fieldMap.timestamp]: {
            order: "desc",
            unmapped_type: "date",
          },
        },
      ],
    },
    resolvedFilters,
    searchText,
  };
}

function buildRetrievalMeta({ config, query, searchText, resolvedFilters, hits, topK }) {
  return {
    index: config.elasticIndex,
    query,
    searchText,
    returned: hits.length,
    requestedTopK: topK,
    appliedFilters: {
      service: resolvedFilters.service,
      level: resolvedFilters.level,
      subscriberId: resolvedFilters.subscriberId,
      timeRange: resolvedFilters.timeRange?.label || null,
    },
    inferredFilters: resolvedFilters.inferred,
  };
}

function buildFilterOnlySearchRequest(searchRequest) {
  return {
    ...searchRequest,
    query: {
      ...searchRequest.query,
      bool: {
        ...searchRequest.query.bool,
        must: [{ match_all: {} }],
      },
    },
  };
}

async function getTopFieldValues({ client, config, fieldName, size = 20 }) {
  const fieldMap = getEffectiveFieldMap(config.fieldMap);
  const candidateFields = [...new Set([`${fieldName}.keyword`, fieldName])];

  for (const candidateField of candidateFields) {
    try {
      const response = await client.search({
        index: config.elasticIndex,
        size: 0,
        aggs: {
          values: {
            terms: {
              field: candidateField,
              size,
            },
          },
        },
      });

      const buckets = response.aggregations?.values?.buckets || [];
      if (buckets.length > 0) {
        return buckets.map((bucket) => bucket.key);
      }
    } catch {
      // Try the next field candidate.
    }
  }

  try {
    const fallback = await client.search({
      index: config.elasticIndex,
      size,
      sort: [
        {
          [fieldMap.timestamp]: {
            order: "desc",
            unmapped_type: "date",
          },
        },
      ],
    });

    return [...new Set(
      (fallback.hits?.hits || [])
        .map((hit) => getValueAtPath(hit._source || {}, fieldName))
        .filter(Boolean),
    )];
  } catch {
    return [];
  }
}

export async function retrieveLogs({ query = "", filters = {}, topK }, deps = {}) {
  const config = deps.config || getConfig();
  const client = deps.client || getElasticsearchClient();
  const { searchRequest, resolvedFilters, searchText } = buildSearchRequest({
    query,
    filters,
    topK,
    config,
  });

  try {
    let response = await client.search(searchRequest);
    let hits = response.hits?.hits || [];
    let fallbackStrategy = null;

    if (
      hits.length === 0 &&
      searchText &&
      (resolvedFilters.service || resolvedFilters.level || resolvedFilters.subscriberId || resolvedFilters.timeRange)
    ) {
      response = await client.search(buildFilterOnlySearchRequest(searchRequest));
      hits = response.hits?.hits || [];
      if (hits.length > 0) {
        fallbackStrategy = "filter_only";
      }
    }

    const evidence = hits.map((hit) => normalizeLogHit(hit, config.fieldMap));

    return {
      evidence,
      retrievalMeta: {
        ...buildRetrievalMeta({
          config,
          query,
          searchText,
          resolvedFilters,
          hits: evidence,
          topK,
        }),
        fallbackStrategy,
      },
    };
  } catch (error) {
    return {
      evidence: [],
      retrievalMeta: {
        ...buildRetrievalMeta({
          config,
          query,
          searchText,
          resolvedFilters,
          hits: [],
          topK,
        }),
        warning: getErrorMessage(error, "Unable to retrieve logs from Elasticsearch."),
      },
    };
  }
}

export async function getLogMetadata(options = {}, deps = {}) {
  const config = deps.config || getConfig();
  const client = deps.client || getElasticsearchClient();
  const size = options.size || 20;
  const fieldMap = getEffectiveFieldMap(config.fieldMap);

  try {
    const [services, levels, subscriberIds] = await Promise.all([
      getTopFieldValues({
        client,
        config,
        fieldName: fieldMap.service,
        size,
      }),
      getTopFieldValues({
        client,
        config,
        fieldName: fieldMap.level,
        size,
      }),
      getTopFieldValues({
        client,
        config,
        fieldName: fieldMap.subscriberId,
        size,
      }),
    ]);

    return { services, levels, subscriberIds };
  } catch (error) {
    return {
      services: [],
      levels: [],
      subscriberIds: [],
      warning: error.message,
    };
  }
}

export async function getElasticsearchHealth(deps = {}) {
  const config = deps.config || getConfig();

  if (!config.elasticUrl) {
    return {
      connected: false,
      message: "ELASTIC_URL is not configured.",
      clusterName: null,
      version: null,
    };
  }

  try {
    const client = deps.client || getElasticsearchClient();
    const info = await client.info();
    const index = {
      name: config.elasticIndex,
      ready: false,
      exists: false,
      documentCount: 0,
      message: "Index has not been checked.",
    };

    try {
      const countResponse = await client.count({ index: config.elasticIndex });
      index.ready = true;
      index.exists = true;
      index.documentCount = countResponse.count || 0;
      index.message = `Index ${config.elasticIndex} is ready.`;
    } catch (error) {
      const statusCode = error?.meta?.statusCode;
      if (statusCode === 404) {
        index.message = `Index ${config.elasticIndex} was not found.`;
      } else {
        index.message = getErrorMessage(error, `Index ${config.elasticIndex} is not queryable yet.`);
      }
    }

    return {
      connected: true,
      message: "Connected to Elasticsearch.",
      clusterName: info.cluster_name || null,
      version: info.version?.number || null,
      index,
    };
  } catch (error) {
    return {
      connected: false,
      message: `Unable to connect to Elasticsearch at ${config.elasticUrl}: ${getErrorMessage(error, "Connection failed.")}`,
      clusterName: null,
      version: null,
      index: {
        name: config.elasticIndex,
        ready: false,
        exists: false,
        documentCount: 0,
        message: "Index status unavailable while the cluster is disconnected.",
      },
    };
  }
}

function titleCase(value) {
  const text = String(value || "").trim();
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : "";
}

function buildCanonicalMessage({ application, subscriberId, summary, exceptionFaultType, exceptionErrorCode }) {
  const prefixes = [
    application,
    subscriberId ? `subscriber ${subscriberId}` : null,
    exceptionFaultType || null,
    exceptionErrorCode ? `code ${exceptionErrorCode}` : null,
  ].filter(Boolean);

  if (!prefixes.length) {
    return summary;
  }

  return `${prefixes.join(" ")}: ${summary}`;
}

function createKibanaSeedLog({
  minutesAgo,
  level,
  application,
  subscriberId,
  summary,
  renderedMessage = summary,
  messageTemplate = summary,
  environment = "test",
  exceptionErrorCode = null,
  exceptionFaultType = null,
  exceptionErrorMessage = null,
  exceptionSource = null,
  exceptionType = null,
  innerMessage = null,
  httpMethod = "GET",
  url = "/",
  statusCode = 200,
  elapsedMilliseconds = 0,
  hostName = "unifytest",
  userEmail = `subscriber${subscriberId}@example.com`,
  subscriptionAge = 30,
  correlationId = `corr-${subscriberId}-${minutesAgo}`,
}) {
  const timestamp = new Date(Date.now() - minutesAgo * 60 * 1000).toISOString();
  const normalizedLevel = String(level || "information").toLowerCase();
  const normalizedSubscriberId = String(subscriberId);
  const canonicalMessage = buildCanonicalMessage({
    application,
    subscriberId: normalizedSubscriberId,
    summary,
    exceptionFaultType,
    exceptionErrorCode,
  });

  const log = {
    message: canonicalMessage,
    summary,
    service: application,
    application,
    level: normalizedLevel,
    timestamp,
    subscriberId: normalizedSubscriberId,
    environment,
    "@timestamp": timestamp,
    "@t": timestamp,
    "@mt": messageTemplate,
    "@m": renderedMessage,
    "@l": titleCase(normalizedLevel),
    Application: application,
    Environment: environment,
    SubscriberId: normalizedSubscriberId,
    Summary: summary,
    UserEmail: userEmail,
    SubscriptionAge: subscriptionAge,
    host: {
      name: hostName,
    },
    agent: {
      type: "filebeat",
      version: "8.14.0",
      id: `agent-${normalizedSubscriberId}`,
      ephemeral_id: `ephemeral-${normalizedSubscriberId}`,
    },
    trace: {
      id: `trace-${normalizedSubscriberId}-${minutesAgo}`,
      correlationId,
    },
    Http: {
      Method: httpMethod,
      Url: url,
      Route: url,
      StatusCode: statusCode,
      ElapsedMilliseconds: elapsedMilliseconds,
    },
  };

  if (exceptionErrorCode || exceptionFaultType || exceptionErrorMessage || exceptionSource || exceptionType || innerMessage) {
    log.Exception = {
      ErrorCode: exceptionErrorCode,
      ErrorMessage: exceptionErrorMessage || summary,
      FaultType: exceptionFaultType,
      InnerException: {
        Source: exceptionSource,
        Message: innerMessage || exceptionErrorMessage || summary,
        Type: exceptionType || null,
      },
    };
  }

  return log;
}

function buildKibanaSeedLogs() {
  return [
    createKibanaSeedLog({
      minutesAgo: 181,
      level: "debug",
      application: "WcfService",
      subscriberId: "89661",
      summary: "JwtSSO tracking started before loading notification preferences for subscriber 89661.",
      renderedMessage: "SubscriberId 89661 Debug JwtSSO tracking started before /Home/GetUserNotificationList.",
      messageTemplate: "SubscriberId {SubscriberId} Debug JwtSSO tracking started before {Route}.",
      url: "/Home/GetUserNotificationList?languageCode=en",
      elapsedMilliseconds: 22,
      subscriptionAge: 720,
    }),
    createKibanaSeedLog({
      minutesAgo: 180,
      level: "information",
      application: "WcfService",
      subscriberId: "89661",
      summary: "Notification list request responded 200 for subscriber 89661.",
      renderedMessage: "SubscriberId 89661 Information HTTP GET /Home/GetUserNotificationList responded 200 in 437ms.",
      messageTemplate: "SubscriberId {SubscriberId} Information HTTP GET {Route} responded {StatusCode} in {ElapsedMilliseconds}ms.",
      url: "/Home/GetUserNotificationList?languageCode=en",
      statusCode: 200,
      elapsedMilliseconds: 437,
      subscriptionAge: 720,
    }),
    createKibanaSeedLog({
      minutesAgo: 179,
      level: "information",
      application: "WcfService",
      subscriberId: "89661",
      summary: "OAuth validation succeeded for subscriber 89661.",
      renderedMessage: "SubscriberId 89661 Information HTTP GET /OAuth/validate responded 200 in 35ms.",
      messageTemplate: "SubscriberId {SubscriberId} Information HTTP GET {Route} responded {StatusCode} in {ElapsedMilliseconds}ms.",
      url: "/OAuth/validate",
      statusCode: 200,
      elapsedMilliseconds: 35,
      subscriptionAge: 720,
    }),
    createKibanaSeedLog({
      minutesAgo: 178,
      level: "error",
      application: "WcfService",
      subscriberId: "89661",
      summary: "A business validation error occurred while saving notification preferences for subscriber 89661.",
      renderedMessage: "A business validation error has occurred while saving notification preferences for subscriber 89661.",
      messageTemplate: "A business validation error has occurred while saving notification preferences for subscriber {SubscriberId}.",
      exceptionErrorCode: "6000",
      exceptionFaultType: "ValidationFault",
      exceptionErrorMessage: "A business validation error has occurred while saving notification preferences.",
      exceptionSource: "System",
      exceptionType: "Exception",
      innerMessage: "Validation rule NotificationPayloadRequired failed for subscriber 89661.",
      url: "/User/UpdatePreference",
      httpMethod: "POST",
      statusCode: 500,
      elapsedMilliseconds: 612,
      subscriptionAge: 720,
    }),
    createKibanaSeedLog({
      minutesAgo: 177,
      level: "error",
      application: "WcfService",
      subscriberId: "89661",
      summary: "A business validation error occurred while saving notification preferences for subscriber 89661.",
      renderedMessage: "A business validation error has occurred while saving notification preferences for subscriber 89661.",
      messageTemplate: "A business validation error has occurred while saving notification preferences for subscriber {SubscriberId}.",
      exceptionErrorCode: "6000",
      exceptionFaultType: "ValidationFault",
      exceptionErrorMessage: "A business validation error has occurred while saving notification preferences.",
      exceptionSource: "System",
      exceptionType: "Exception",
      innerMessage: "Validation rule NotificationPayloadRequired failed for subscriber 89661.",
      url: "/User/UpdatePreference",
      httpMethod: "POST",
      statusCode: 500,
      elapsedMilliseconds: 598,
      subscriptionAge: 720,
    }),
    createKibanaSeedLog({
      minutesAgo: 176,
      level: "error",
      application: "WcfService",
      subscriberId: "89661",
      summary: "A business validation error occurred while saving notification preferences for subscriber 89661.",
      renderedMessage: "A business validation error has occurred while saving notification preferences for subscriber 89661.",
      messageTemplate: "A business validation error has occurred while saving notification preferences for subscriber {SubscriberId}.",
      exceptionErrorCode: "6000",
      exceptionFaultType: "ValidationFault",
      exceptionErrorMessage: "A business validation error has occurred while saving notification preferences.",
      exceptionSource: "System",
      exceptionType: "Exception",
      innerMessage: "Validation rule NotificationPayloadRequired failed for subscriber 89661.",
      url: "/User/UpdatePreference",
      httpMethod: "POST",
      statusCode: 500,
      elapsedMilliseconds: 605,
      subscriptionAge: 720,
    }),
    createKibanaSeedLog({
      minutesAgo: 154,
      level: "information",
      application: "NotificationPayloadProcessorService",
      subscriberId: "55421",
      summary: "Notification payload picked up from queue for subscriber 55421.",
      renderedMessage: "SubscriberId 55421 Information NotificationPayloadProcessorService picked message from queue.",
      messageTemplate: "SubscriberId {SubscriberId} Information NotificationPayloadProcessorService picked message from queue.",
      url: "/notifications/payload/process",
      httpMethod: "POST",
      statusCode: 202,
      elapsedMilliseconds: 118,
      subscriptionAge: 186,
    }),
    createKibanaSeedLog({
      minutesAgo: 153,
      level: "warning",
      application: "NotificationPayloadProcessorService",
      subscriberId: "55421",
      summary: "Notification payload schema mismatch detected for subscriber 55421.",
      renderedMessage: "SubscriberId 55421 Warning payload schema mismatch on NotificationPayloadProcessorService.",
      messageTemplate: "SubscriberId {SubscriberId} Warning payload schema mismatch on NotificationPayloadProcessorService.",
      url: "/notifications/payload/process",
      httpMethod: "POST",
      statusCode: 422,
      elapsedMilliseconds: 227,
      subscriptionAge: 186,
    }),
    createKibanaSeedLog({
      minutesAgo: 152,
      level: "error",
      application: "NotificationPayloadProcessorService",
      subscriberId: "55421",
      summary: "Notification payload validation failed for subscriber 55421 because DestinationEmail was missing.",
      renderedMessage: "SubscriberId 55421 Error payload validation failed because DestinationEmail was missing.",
      messageTemplate: "SubscriberId {SubscriberId} Error payload validation failed because DestinationEmail was missing.",
      exceptionErrorCode: "7201",
      exceptionFaultType: "ValidationFault",
      exceptionErrorMessage: "Payload validation failed because DestinationEmail was missing.",
      exceptionSource: "NotificationPayloadProcessorService",
      exceptionType: "PayloadValidationException",
      innerMessage: "Field DestinationEmail is required for NotificationPayloadProcessorService.",
      url: "/notifications/payload/process",
      httpMethod: "POST",
      statusCode: 500,
      elapsedMilliseconds: 481,
      subscriptionAge: 186,
    }),
    createKibanaSeedLog({
      minutesAgo: 151,
      level: "warning",
      application: "QueueServer",
      subscriberId: "55421",
      summary: "QueueServer scheduled retry for invalid notification payload for subscriber 55421.",
      renderedMessage: "SubscriberId 55421 Warning QueueServer scheduled retry after payload validation failure.",
      messageTemplate: "SubscriberId {SubscriberId} Warning QueueServer scheduled retry after payload validation failure.",
      url: "/queue/retry",
      httpMethod: "POST",
      statusCode: 202,
      elapsedMilliseconds: 94,
      subscriptionAge: 186,
    }),
    createKibanaSeedLog({
      minutesAgo: 150,
      level: "error",
      application: "BeanstalkdConsumer",
      subscriberId: "55421",
      summary: "Retry exhaustion moved notification payload to the poison queue for subscriber 55421.",
      renderedMessage: "SubscriberId 55421 Error BeanstalkdConsumer moved the message to the poison queue after retry exhaustion.",
      messageTemplate: "SubscriberId {SubscriberId} Error BeanstalkdConsumer moved the message to the poison queue after retry exhaustion.",
      exceptionErrorCode: "7209",
      exceptionFaultType: "QueueProcessingFault",
      exceptionErrorMessage: "Retry exhaustion moved notification payload to the poison queue.",
      exceptionSource: "BeanstalkdConsumer",
      exceptionType: "RetryExceededException",
      innerMessage: "Message failed validation three consecutive times.",
      url: "/queue/dead-letter",
      httpMethod: "POST",
      statusCode: 500,
      elapsedMilliseconds: 301,
      subscriptionAge: 186,
    }),
    createKibanaSeedLog({
      minutesAgo: 132,
      level: "information",
      application: "QueueServer",
      subscriberId: "33218",
      summary: "Queue dequeue request succeeded for subscriber 33218.",
      renderedMessage: "SubscriberId 33218 Information HTTP POST /Queue/Dequeue responded 200 in 64ms.",
      messageTemplate: "SubscriberId {SubscriberId} Information HTTP POST {Route} responded {StatusCode} in {ElapsedMilliseconds}ms.",
      url: "/Queue/Dequeue",
      httpMethod: "POST",
      statusCode: 200,
      elapsedMilliseconds: 64,
      subscriptionAge: 402,
    }),
    createKibanaSeedLog({
      minutesAgo: 131,
      level: "warning",
      application: "QueueServer",
      subscriberId: "33218",
      summary: "Queue processing latency exceeded the configured threshold for subscriber 33218.",
      renderedMessage: "SubscriberId 33218 Warning queue processing latency exceeded the configured threshold.",
      messageTemplate: "SubscriberId {SubscriberId} Warning queue processing latency exceeded the configured threshold.",
      url: "/Queue/Process",
      httpMethod: "POST",
      statusCode: 200,
      elapsedMilliseconds: 1890,
      subscriptionAge: 402,
    }),
    createKibanaSeedLog({
      minutesAgo: 130,
      level: "error",
      application: "QueueServer",
      subscriberId: "33218",
      summary: "Queue processing failed because SQL command timeout was reached for subscriber 33218.",
      renderedMessage: "SubscriberId 33218 Error queue processing failed because SQL command timeout was reached.",
      messageTemplate: "SubscriberId {SubscriberId} Error queue processing failed because SQL command timeout was reached.",
      exceptionErrorCode: "5102",
      exceptionFaultType: "TimeoutFault",
      exceptionErrorMessage: "Execution timeout expired while reading subscriber work items.",
      exceptionSource: "System.Data.SqlClient",
      exceptionType: "SqlException",
      innerMessage: "Execution timeout expired. The timeout period elapsed before completion of the operation.",
      url: "/Queue/Process",
      httpMethod: "POST",
      statusCode: 500,
      elapsedMilliseconds: 30000,
      subscriptionAge: 402,
    }),
    createKibanaSeedLog({
      minutesAgo: 129,
      level: "error",
      application: "QueueServer",
      subscriberId: "33218",
      summary: "QueueServer failed to persist dequeue state because the connection pool was exhausted for subscriber 33218.",
      renderedMessage: "SubscriberId 33218 Error QueueServer failed to persist dequeue state because the connection pool was exhausted.",
      messageTemplate: "SubscriberId {SubscriberId} Error QueueServer failed to persist dequeue state because the connection pool was exhausted.",
      exceptionErrorCode: "5103",
      exceptionFaultType: "InfrastructureFault",
      exceptionErrorMessage: "Connection pool exhausted while persisting dequeue state.",
      exceptionSource: "System.Data.SqlClient",
      exceptionType: "InvalidOperationException",
      innerMessage: "Timeout expired prior to obtaining a connection from the pool.",
      url: "/Queue/Process",
      httpMethod: "POST",
      statusCode: 500,
      elapsedMilliseconds: 2184,
      subscriptionAge: 402,
    }),
    createKibanaSeedLog({
      minutesAgo: 128,
      level: "critical",
      application: "QueueServer",
      subscriberId: "33218",
      summary: "QueueServer opened a circuit breaker after repeated timeout failures for subscriber 33218.",
      renderedMessage: "SubscriberId 33218 Critical QueueServer opened a circuit breaker after repeated timeout failures.",
      messageTemplate: "SubscriberId {SubscriberId} Critical QueueServer opened a circuit breaker after repeated timeout failures.",
      exceptionErrorCode: "5110",
      exceptionFaultType: "CircuitBreakerFault",
      exceptionErrorMessage: "Circuit breaker opened after repeated timeout failures.",
      exceptionSource: "QueueServer",
      exceptionType: "CircuitBreakerOpenException",
      innerMessage: "Five consecutive timeout failures triggered the circuit breaker.",
      url: "/Queue/Process",
      httpMethod: "POST",
      statusCode: 503,
      elapsedMilliseconds: 91,
      subscriptionAge: 402,
    }),
    createKibanaSeedLog({
      minutesAgo: 108,
      level: "information",
      application: "eCCCloudService",
      subscriberId: "44770",
      summary: "Subscriber synchronization started for subscriber 44770.",
      renderedMessage: "SubscriberId 44770 Information eCCCloudService started subscriber synchronization.",
      messageTemplate: "SubscriberId {SubscriberId} Information eCCCloudService started subscriber synchronization.",
      url: "/subscription/sync",
      httpMethod: "POST",
      statusCode: 202,
      elapsedMilliseconds: 143,
      subscriptionAge: 95,
    }),
    createKibanaSeedLog({
      minutesAgo: 107,
      level: "warning",
      application: "CCCCloudService",
      subscriberId: "44770",
      summary: "Downstream CCCCloud subscription update responded 503 for subscriber 44770.",
      renderedMessage: "SubscriberId 44770 Warning HTTP POST /ccccloud/subscription/update responded 503 in 1237ms.",
      messageTemplate: "SubscriberId {SubscriberId} Warning HTTP POST {Route} responded {StatusCode} in {ElapsedMilliseconds}ms.",
      url: "/ccccloud/subscription/update",
      httpMethod: "POST",
      statusCode: 503,
      elapsedMilliseconds: 1237,
      subscriptionAge: 95,
    }),
    createKibanaSeedLog({
      minutesAgo: 106,
      level: "error",
      application: "eCCCloudService",
      subscriberId: "44770",
      summary: "Subscriber synchronization failed because CCCCloud returned service unavailable for subscriber 44770.",
      renderedMessage: "SubscriberId 44770 Error subscriber synchronization failed because CCCCloud returned service unavailable.",
      messageTemplate: "SubscriberId {SubscriberId} Error subscriber synchronization failed because CCCCloud returned service unavailable.",
      exceptionErrorCode: "5303",
      exceptionFaultType: "UpstreamFault",
      exceptionErrorMessage: "CCCCloud returned 503 Service Unavailable.",
      exceptionSource: "CCCCloud",
      exceptionType: "HttpRequestException",
      innerMessage: "Response status code does not indicate success: 503 (Service Unavailable).",
      url: "/subscription/sync",
      httpMethod: "POST",
      statusCode: 500,
      elapsedMilliseconds: 1268,
      subscriptionAge: 95,
    }),
    createKibanaSeedLog({
      minutesAgo: 105,
      level: "error",
      application: "eCCCloudService",
      subscriberId: "44770",
      summary: "Circuit breaker opened for CCCCloud subscriber synchronization after repeated 503 responses for subscriber 44770.",
      renderedMessage: "SubscriberId 44770 Error circuit breaker opened for CCCCloud subscriber synchronization after repeated 503 responses.",
      messageTemplate: "SubscriberId {SubscriberId} Error circuit breaker opened for CCCCloud subscriber synchronization after repeated 503 responses.",
      exceptionErrorCode: "5308",
      exceptionFaultType: "CircuitBreakerFault",
      exceptionErrorMessage: "Circuit breaker opened for CCCCloud subscriber synchronization.",
      exceptionSource: "eCCCloudService",
      exceptionType: "CircuitBreakerOpenException",
      innerMessage: "Three consecutive upstream 503 responses opened the circuit breaker.",
      url: "/subscription/sync",
      httpMethod: "POST",
      statusCode: 503,
      elapsedMilliseconds: 76,
      subscriptionAge: 95,
    }),
    createKibanaSeedLog({
      minutesAgo: 104,
      level: "warning",
      application: "QueueServer",
      subscriberId: "44770",
      summary: "QueueServer scheduled backoff retry for subscriber 44770 after downstream CCCCloud failure.",
      renderedMessage: "SubscriberId 44770 Warning QueueServer scheduled backoff retry after downstream CCCCloud failure.",
      messageTemplate: "SubscriberId {SubscriberId} Warning QueueServer scheduled backoff retry after downstream CCCCloud failure.",
      url: "/queue/retry",
      httpMethod: "POST",
      statusCode: 202,
      elapsedMilliseconds: 88,
      subscriptionAge: 95,
    }),
    createKibanaSeedLog({
      minutesAgo: 84,
      level: "debug",
      application: "WcfService",
      subscriberId: "77590",
      summary: "JwtSSO token refresh started for subscriber 77590.",
      renderedMessage: "SubscriberId 77590 Debug JwtSSO token refresh started.",
      messageTemplate: "SubscriberId {SubscriberId} Debug JwtSSO token refresh started.",
      url: "/OAuth/refresh",
      elapsedMilliseconds: 18,
      subscriptionAge: 27,
    }),
    createKibanaSeedLog({
      minutesAgo: 83,
      level: "warning",
      application: "WcfService",
      subscriberId: "77590",
      summary: "JwtSSO token expires within one minute for subscriber 77590.",
      renderedMessage: "SubscriberId 77590 Warning JwtSSO token expires within one minute.",
      messageTemplate: "SubscriberId {SubscriberId} Warning JwtSSO token expires within one minute.",
      url: "/OAuth/refresh",
      statusCode: 200,
      elapsedMilliseconds: 27,
      subscriptionAge: 27,
    }),
    createKibanaSeedLog({
      minutesAgo: 82,
      level: "error",
      application: "WcfService",
      subscriberId: "77590",
      summary: "User authentication failed because the JWT signature was invalid for subscriber 77590.",
      renderedMessage: "SubscriberId 77590 Error user authentication failed because the JWT signature was invalid.",
      messageTemplate: "SubscriberId {SubscriberId} Error user authentication failed because the JWT signature was invalid.",
      exceptionErrorCode: "4010",
      exceptionFaultType: "AuthenticationFault",
      exceptionErrorMessage: "The JWT signature was invalid.",
      exceptionSource: "System.IdentityModel.Tokens.Jwt",
      exceptionType: "SecurityTokenInvalidSignatureException",
      innerMessage: "IDX10503: Signature validation failed because the keys did not match.",
      url: "/OAuth/validate",
      statusCode: 401,
      elapsedMilliseconds: 11,
      subscriptionAge: 27,
    }),
    createKibanaSeedLog({
      minutesAgo: 81,
      level: "information",
      application: "WcfService",
      subscriberId: "77590",
      summary: "OAuth validate endpoint returned 401 for subscriber 77590.",
      renderedMessage: "SubscriberId 77590 Information HTTP GET /OAuth/validate responded 401 in 11ms.",
      messageTemplate: "SubscriberId {SubscriberId} Information HTTP GET {Route} responded {StatusCode} in {ElapsedMilliseconds}ms.",
      url: "/OAuth/validate",
      statusCode: 401,
      elapsedMilliseconds: 11,
      subscriptionAge: 27,
    }),
    createKibanaSeedLog({
      minutesAgo: 80,
      level: "error",
      application: "WcfService",
      subscriberId: "77590",
      summary: "User context creation failed after authentication fault for subscriber 77590.",
      renderedMessage: "SubscriberId 77590 Error user context creation failed after authentication fault.",
      messageTemplate: "SubscriberId {SubscriberId} Error user context creation failed after authentication fault.",
      exceptionErrorCode: "4011",
      exceptionFaultType: "AuthenticationFault",
      exceptionErrorMessage: "User context could not be created after authentication fault.",
      exceptionSource: "WcfService",
      exceptionType: "UnauthorizedAccessException",
      innerMessage: "Principal could not be built because token validation failed.",
      url: "/User/Context",
      httpMethod: "POST",
      statusCode: 500,
      elapsedMilliseconds: 144,
      subscriptionAge: 27,
    }),
    createKibanaSeedLog({
      minutesAgo: 58,
      level: "information",
      application: "eCCCloudService",
      subscriberId: "12004",
      summary: "Subscription action payload accepted for subscriber 12004.",
      renderedMessage: "SubscriberId 12004 Information subscription action payload accepted.",
      messageTemplate: "SubscriberId {SubscriberId} Information subscription action payload accepted.",
      url: "/subscription/action",
      httpMethod: "POST",
      statusCode: 202,
      elapsedMilliseconds: 141,
      subscriptionAge: 14,
    }),
    createKibanaSeedLog({
      minutesAgo: 57,
      level: "error",
      application: "eCCCloudService",
      subscriberId: "12004",
      summary: "Subscription action mapping failed because a null reference was encountered for subscriber 12004.",
      renderedMessage: "SubscriberId 12004 Error subscription action mapping failed because a null reference was encountered.",
      messageTemplate: "SubscriberId {SubscriberId} Error subscription action mapping failed because a null reference was encountered.",
      exceptionErrorCode: "9001",
      exceptionFaultType: "ProcessingFault",
      exceptionErrorMessage: "Object reference not set to an instance of an object during subscription action mapping.",
      exceptionSource: "eCCCloudService",
      exceptionType: "NullReferenceException",
      innerMessage: "Object reference not set to an instance of an object.",
      url: "/subscription/action",
      httpMethod: "POST",
      statusCode: 500,
      elapsedMilliseconds: 394,
      subscriptionAge: 14,
    }),
    createKibanaSeedLog({
      minutesAgo: 56,
      level: "error",
      application: "eCCCloudService",
      subscriberId: "12004",
      summary: "Subscription action retry failed because the null reference condition persisted for subscriber 12004.",
      renderedMessage: "SubscriberId 12004 Error subscription action retry failed because the null reference condition persisted.",
      messageTemplate: "SubscriberId {SubscriberId} Error subscription action retry failed because the null reference condition persisted.",
      exceptionErrorCode: "9001",
      exceptionFaultType: "ProcessingFault",
      exceptionErrorMessage: "Retry failed because the null reference condition persisted.",
      exceptionSource: "eCCCloudService",
      exceptionType: "NullReferenceException",
      innerMessage: "Object reference not set to an instance of an object.",
      url: "/subscription/action/retry",
      httpMethod: "POST",
      statusCode: 500,
      elapsedMilliseconds: 412,
      subscriptionAge: 14,
    }),
    createKibanaSeedLog({
      minutesAgo: 55,
      level: "warning",
      application: "BeanstalkdConsumer",
      subscriberId: "12004",
      summary: "Subscription action message moved to dead-letter queue for subscriber 12004 after repeated null reference failures.",
      renderedMessage: "SubscriberId 12004 Warning subscription action message moved to dead-letter queue after repeated null reference failures.",
      messageTemplate: "SubscriberId {SubscriberId} Warning subscription action message moved to dead-letter queue after repeated null reference failures.",
      url: "/queue/dead-letter",
      httpMethod: "POST",
      statusCode: 202,
      elapsedMilliseconds: 117,
      subscriptionAge: 14,
    }),
    createKibanaSeedLog({
      minutesAgo: 35,
      level: "information",
      application: "WcfService",
      subscriberId: "22190",
      summary: "Notification list loaded successfully for subscriber 22190.",
      renderedMessage: "SubscriberId 22190 Information HTTP GET /Home/GetUserNotificationList responded 200 in 121ms.",
      messageTemplate: "SubscriberId {SubscriberId} Information HTTP GET {Route} responded {StatusCode} in {ElapsedMilliseconds}ms.",
      url: "/Home/GetUserNotificationList?languageCode=en",
      statusCode: 200,
      elapsedMilliseconds: 121,
      subscriptionAge: 61,
    }),
    createKibanaSeedLog({
      minutesAgo: 34,
      level: "information",
      application: "WcfService",
      subscriberId: "22190",
      summary: "Notification preference update completed successfully for subscriber 22190.",
      renderedMessage: "SubscriberId 22190 Information HTTP POST /User/UpdatePreference responded 200 in 188ms.",
      messageTemplate: "SubscriberId {SubscriberId} Information HTTP POST {Route} responded {StatusCode} in {ElapsedMilliseconds}ms.",
      url: "/User/UpdatePreference",
      httpMethod: "POST",
      statusCode: 200,
      elapsedMilliseconds: 188,
      subscriptionAge: 61,
    }),
    createKibanaSeedLog({
      minutesAgo: 33,
      level: "debug",
      application: "WcfService",
      subscriberId: "22190",
      summary: "Subscriber cache warmed successfully for subscriber 22190.",
      renderedMessage: "SubscriberId 22190 Debug subscriber cache warmed successfully.",
      messageTemplate: "SubscriberId {SubscriberId} Debug subscriber cache warmed successfully.",
      url: "/cache/subscriber",
      elapsedMilliseconds: 16,
      subscriptionAge: 61,
    }),
  ];
}

export async function seedLogs(deps = {}) {
  const config = deps.config || getConfig();
  const client = deps.client || getElasticsearchClient();
  const sampleLogs = [
    ...buildKibanaSeedLogs(),
  ];

  const operations = sampleLogs.flatMap((log) => [{ index: { _index: config.elasticIndex } }, log]);

  await ensureLogIndex(client, config);
  await client.bulk({
    refresh: true,
    operations,
  });

  return sampleLogs.length;
}

export async function clearLogs(deps = {}) {
  const config = deps.config || getConfig();
  const client = deps.client || getElasticsearchClient();

  try {
    await client.indices.delete({ index: config.elasticIndex });
  } catch (error) {
    if (error.meta?.statusCode !== 404) {
      throw error;
    }
  }
}

export { buildSearchRequest, getValueAtPath };
