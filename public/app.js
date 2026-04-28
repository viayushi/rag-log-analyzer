const elements = {
  analysisView: document.getElementById("analysis-view"),
  answerCauses: document.getElementById("answer-causes"),
  answerEvidenceCount: document.getElementById("answer-evidence-count"),
  answerNextSteps: document.getElementById("answer-next-steps"),
  answerServices: document.getElementById("answer-services"),
  answerSeverity: document.getElementById("answer-severity"),
  answerSummary: document.getElementById("answer-summary"),
  emptyState: document.getElementById("empty-state"),
  errorState: document.getElementById("error-state"),
  evidenceList: document.getElementById("evidence-list"),
  evidenceMeta: document.getElementById("evidence-meta"),
  healthPill: document.getElementById("health-pill"),
  loadingState: document.getElementById("loading-state"),
  queryForm: document.getElementById("query-form"),
  queryInput: document.getElementById("query-input"),
  querySummary: document.getElementById("query-summary"),
  retrieveButton: document.getElementById("retrieve-button"),
  serviceFilter: document.getElementById("service-filter"),
  subscriberFilter: document.getElementById("subscriber-filter"),
  levelFilter: document.getElementById("level-filter"),
  timeFilter: document.getElementById("time-filter"),
  topKInput: document.getElementById("top-k-input"),
};

function setLoading(isLoading, message = "Working through retrieval and analysis...") {
  elements.loadingState.textContent = message;
  elements.loadingState.classList.toggle("state--hidden", !isLoading);
}

function showError(message) {
  elements.errorState.textContent = message;
  elements.errorState.classList.remove("state--hidden");
}

function clearError() {
  elements.errorState.classList.add("state--hidden");
  elements.errorState.textContent = "";
}

function resetResults() {
  elements.analysisView.classList.add("state--hidden");
  elements.emptyState.classList.remove("state--hidden");
  elements.evidenceList.innerHTML = "";
  elements.evidenceMeta.textContent = "No logs loaded.";
}

function renderList(target, values) {
  target.innerHTML = "";

  for (const value of values) {
    const item = document.createElement("li");
    item.textContent = value;
    target.appendChild(item);
  }
}

function appendMetaToken(target, text, className = "badge") {
  if (!text) {
    return;
  }

  const item = document.createElement("span");
  item.className = className;
  item.textContent = text;
  target.appendChild(item);
}

function renderEvidence(evidence, evidenceIds = []) {
  const evidenceSet = new Set(evidenceIds);
  elements.evidenceList.innerHTML = "";

  if (!evidence.length) {
    const empty = document.createElement("div");
    empty.className = "state";
    empty.textContent = "No logs matched the current request.";
    elements.evidenceList.appendChild(empty);
    return;
  }

  for (const log of evidence) {
    const item = document.createElement("article");
    item.className = `evidence-item${evidenceSet.has(log.id) ? " evidence-item--highlight" : ""}`;

    const meta = document.createElement("div");
    meta.className = "evidence-meta";
    appendMetaToken(meta, log.application || log.service || "unknown application");
    appendMetaToken(meta, log.level || "unknown level");
    appendMetaToken(meta, log.subscriberId ? `Subscriber ${log.subscriberId}` : null);
    appendMetaToken(meta, log.environment || null);
    appendMetaToken(meta, log.exceptionFaultType || null);
    appendMetaToken(meta, log.exceptionErrorCode ? `Code ${log.exceptionErrorCode}` : null);
    appendMetaToken(meta, formatTimestamp(log.timestamp), "meta-text");
    appendMetaToken(meta, `ID: ${log.id}`, "meta-text");

    const message = document.createElement("p");
    message.textContent = log.summary || log.message || "(empty message)";

    if (log.exceptionMessage && log.exceptionMessage !== log.summary) {
      const exceptionMessage = document.createElement("p");
      exceptionMessage.className = "muted";
      exceptionMessage.textContent = `Exception: ${log.exceptionMessage}`;
      item.append(meta, message, exceptionMessage);
    } else {
      item.append(meta, message);
    }

    const rawDetails = document.createElement("details");
    rawDetails.innerHTML = "<summary>Raw source</summary>";
    const pre = document.createElement("pre");
    pre.textContent = JSON.stringify(log.rawSource, null, 2);
    rawDetails.appendChild(pre);

    item.append(rawDetails);
    elements.evidenceList.appendChild(item);
  }
}

function renderAnswer(response, query) {
  const answer = response.answer;
  const evidenceIds = answer?.evidence_log_ids || [];

  elements.querySummary.textContent = `Query: ${query}`;
  elements.answerSummary.textContent = answer.summary || "No summary returned.";
  elements.answerSeverity.textContent = answer.severity_assessment || "unknown";
  elements.answerServices.textContent = (answer.services_involved || []).join(", ") || "None";
  elements.answerEvidenceCount.textContent = String(evidenceIds.length);
  renderList(elements.answerCauses, answer.likely_causes || []);
  renderList(elements.answerNextSteps, answer.recommended_next_steps || []);
  renderEvidence(response.evidence || [], evidenceIds);

  elements.emptyState.classList.add("state--hidden");
  elements.analysisView.classList.remove("state--hidden");

  const meta = response.retrievalMeta;
  elements.evidenceMeta.textContent = `${meta.returned} logs returned from ${meta.index} using ${meta.searchText ? `"${meta.searchText}"` : "filter-only retrieval"}.`;
}

function renderRetrievalOnly(response, query) {
  elements.querySummary.textContent = `Retrieved evidence for: ${query}`;
  elements.analysisView.classList.add("state--hidden");
  elements.emptyState.classList.remove("state--hidden");
  elements.emptyState.textContent = "Logs retrieved. Analysis was not requested.";
  renderEvidence(response.evidence || [], []);

  const meta = response.retrievalMeta;
  elements.evidenceMeta.textContent = `${meta.returned} logs returned from ${meta.index} using ${meta.searchText ? `"${meta.searchText}"` : "filter-only retrieval"}.`;
}

function formatTimestamp(value) {
  if (!value) {
    return "No timestamp";
  }

  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) {
    return value;
  }

  return timestamp.toLocaleString();
}

function readPayload() {
  return {
    query: elements.queryInput.value.trim(),
    filters: {
      timeRange: elements.timeFilter.value,
      service: elements.serviceFilter.value,
      level: elements.levelFilter.value,
      subscriberId: elements.subscriberFilter.value.trim(),
    },
    topK: Number(elements.topKInput.value) || 12,
  };
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(body.error || "Request failed");
  }

  return body;
}

async function refreshHealth() {
  try {
    const health = await fetchJson("/api/health");
    const isHealthy = health.status === "ok";
    elements.healthPill.className = `health-pill${isHealthy ? "" : " health-pill--error"}`;
    elements.healthPill.textContent = isHealthy
      ? `Elasticsearch ready: ${health.config.elasticIndex}`
      : `Attention needed: ${health.status}`;

    populateSelect(elements.serviceFilter, health.metadata.services);
    populateSelect(elements.levelFilter, health.metadata.levels);
  } catch (error) {
    elements.healthPill.className = "health-pill health-pill--error";
    elements.healthPill.textContent = "Health check failed";
  }
}

function populateSelect(select, values) {
  const currentValue = select.value;
  const label = select === elements.serviceFilter ? "Auto" : "Auto";

  select.innerHTML = `<option value="">${label}</option>`;
  for (const value of values || []) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    select.appendChild(option);
  }
  select.value = currentValue;
}

async function handleSubmit(mode) {
  clearError();
  setLoading(true, mode === "ask" ? "Retrieving logs and generating analysis..." : "Retrieving logs...");

  const payload = readPayload();
  if (!payload.query) {
    setLoading(false);
    showError("Please enter a question to analyze.");
    return;
  }

  try {
    const endpoint = mode === "ask" ? "/api/ask" : "/api/retrieve";
    const response = await fetchJson(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (mode === "ask") {
      renderAnswer(response, payload.query);
    } else {
      renderRetrievalOnly(response, payload.query);
    }
  } catch (error) {
    showError(error.message);
  } finally {
    setLoading(false);
  }
}

elements.queryForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  await handleSubmit("ask");
});

elements.retrieveButton.addEventListener("click", async () => {
  await handleSubmit("retrieve");
});

resetResults();
refreshHealth();
