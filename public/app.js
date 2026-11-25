const els = {
  navSqliteBtn: document.getElementById("nav-sqlite-btn"),
  navPlaygroundBtn: document.getElementById("nav-playground-btn"),
  sqliteView: document.getElementById("sqlite-view"),
  playgroundView: document.getElementById("playground-view"),
  modelBadge: document.getElementById("model-badge"),
  modelStatusText: document.getElementById("model-status-text"),
  modelMeta: document.getElementById("model-meta"),

  // SQLite Pipeline elements
  sqliteErrorBanner: document.getElementById("sqlite-error-banner"),
  classifyPendingBtn: document.getElementById("classify-pending-btn"),
  reclassifyAllBtn: document.getElementById("reclassify-all-btn"),
  toggleAddTicketBtn: document.getElementById("toggle-add-ticket-btn"),
  resetTicketsBtn: document.getElementById("reset-tickets-btn"),
  sqliteThresholdSlider: document.getElementById("sqlite-threshold-slider"),
  sqliteThresholdValue: document.getElementById("sqlite-threshold-value"),
  ticketFilters: document.getElementById("ticket-filters"),
  addTicketForm: document.getElementById("add-ticket-form"),
  cancelAddTicketBtn: document.getElementById("cancel-add-ticket-btn"),
  newCustomer: document.getElementById("new-customer"),
  newPriority: document.getElementById("new-priority"),
  newSummary: document.getElementById("new-summary"),
  newComments: document.getElementById("new-comments"),
  kpiTotal: document.getElementById("kpi-total"),
  kpiClassified: document.getElementById("kpi-classified"),
  kpiEscalation: document.getElementById("kpi-escalation"),
  kpiReview: document.getElementById("kpi-review"),
  ticketsList: document.getElementById("tickets-list"),

  // Playground elements
  presetButtons: document.getElementById("preset-buttons"),
  stateInput: document.getElementById("state-input"),
  stateModeHint: document.getElementById("state-mode-hint"),
  formatStateBtn: document.getElementById("format-state-btn"),
  modeBuilderBtn: document.getElementById("mode-builder-btn"),
  modeJsonBtn: document.getElementById("mode-json-btn"),
  questionsBuilder: document.getElementById("questions-builder"),
  questionsJsonWrap: document.getElementById("questions-json-wrap"),
  questionCards: document.getElementById("question-cards"),
  questionsJsonInput: document.getElementById("questions-json-input"),
  thresholdSlider: document.getElementById("threshold-slider"),
  thresholdValue: document.getElementById("threshold-value"),
  evaluateBtn: document.getElementById("evaluate-btn"),
  errorBanner: document.getElementById("error-banner"),
  metricsRow: document.getElementById("metrics-row"),
  metricLatency: document.getElementById("metric-latency"),
  metricTokens: document.getElementById("metric-tokens"),
  metricQuestions: document.getElementById("metric-questions"),
  metricModel: document.getElementById("metric-model"),
  gateSummary: document.getElementById("gate-summary"),
  resultsEmpty: document.getElementById("results-empty"),
  resultsList: document.getElementById("results-list"),
  rawJsonDetails: document.getElementById("raw-json-details"),
  rawJsonOutput: document.getElementById("raw-json-output"),
};

let presets = [];
let ticketsData = [];
let ticketFilter = "all";
let questionMode = "builder";
let questionsObj = {};
let lastEvalResponse = null;
let modelReady = false;

function switchMainTab(tab) {
  const isSqlite = tab === "sqlite";
  els.navSqliteBtn.classList.toggle("active", isSqlite);
  els.navPlaygroundBtn.classList.toggle("active", !isSqlite);
  els.sqliteView.classList.toggle("hidden", !isSqlite);
  els.playgroundView.classList.toggle("hidden", isSqlite);
}

function showSqliteError(message) {
  if (!message) {
    els.sqliteErrorBanner.classList.add("hidden");
    els.sqliteErrorBanner.textContent = "";
    return;
  }
  els.sqliteErrorBanner.textContent = message;
  els.sqliteErrorBanner.classList.remove("hidden");
}

function showError(message) {
  if (!message) {
    els.errorBanner.classList.add("hidden");
    els.errorBanner.textContent = "";
    return;
  }
  els.errorBanner.textContent = message;
  els.errorBanner.classList.remove("hidden");
}

function syncModelButtons() {
  els.evaluateBtn.disabled = !modelReady;
  els.classifyPendingBtn.disabled = !modelReady;
  els.reclassifyAllBtn.disabled = !modelReady;
  for (const btn of els.ticketsList.querySelectorAll("[data-classify-key]")) {
    btn.disabled = !modelReady;
  }
}

// =====================================================================
// Jira + SQLite Pipeline View
// =====================================================================

function renderTickets() {
  const threshold = Number(els.sqliteThresholdSlider.value);

  let classified = 0;
  let escalationAlerts = 0;
  let needsReview = 0;

  for (const t of ticketsData) {
    if (t.classification) {
      classified += 1;
      if (t.classification.escalation_risk >= 0.5) escalationAlerts += 1;
      if (t.classification.category_confidence < threshold) needsReview += 1;
    }
  }

  els.kpiTotal.textContent = String(ticketsData.length);
  els.kpiClassified.textContent = String(classified);
  els.kpiEscalation.textContent = String(escalationAlerts);
  els.kpiReview.textContent = String(needsReview);

  const filtered = ticketsData.filter((t) => {
    if (ticketFilter === "escalation") return Boolean(t.classification && t.classification.escalation_risk >= 0.5);
    if (ticketFilter === "review") return Boolean(t.classification && t.classification.category_confidence < threshold);
    if (ticketFilter === "unclassified") return !t.classification;
    return true;
  });

  els.ticketsList.innerHTML = "";
  if (filtered.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "No Jira tickets match the selected filter.";
    els.ticketsList.appendChild(empty);
    return;
  }

  for (const t of filtered) {
    const cls = t.classification;
    const isReview = Boolean(cls && cls.category_confidence < threshold);
    const isEsc = Boolean(cls && cls.escalation_risk >= 0.5);

    const card = document.createElement("div");
    card.className = `ticket-card${isEsc ? " ticket-escalation" : isReview ? " ticket-review" : ""}`;

    const top = document.createElement("div");
    top.className = "ticket-top";

    const left = document.createElement("div");
    const titleRow = document.createElement("div");
    titleRow.className = "ticket-title-row";

    const keyBadge = document.createElement("span");
    keyBadge.className = "ticket-key";
    keyBadge.textContent = t.ticket_key;

    const cust = document.createElement("span");
    cust.className = "ticket-customer";
    cust.textContent = `${t.customer} · Priority: ${t.priority} · Status: ${t.status}`;

    titleRow.append(keyBadge, cust);

    if (cls) {
      const gateChip = document.createElement("span");
      gateChip.className = `gate-chip ${isReview ? "gate-escalate" : "gate-pass"}`;
      gateChip.textContent = isReview
        ? `Needs Review (${(cls.category_confidence * 100).toFixed(1)}%)`
        : `Auto-Tagged (${(cls.category_confidence * 100).toFixed(1)}%)`;
      titleRow.appendChild(gateChip);
    } else {
      const pendingChip = document.createElement("span");
      pendingChip.className = "gate-chip";
      pendingChip.style.background = "rgba(148,163,184,0.18)";
      pendingChip.style.color = "#cbd5e1";
      pendingChip.textContent = "Unclassified in SQLite";
      titleRow.appendChild(pendingChip);
    }

    const summary = document.createElement("p");
    summary.className = "ticket-summary";
    summary.textContent = t.summary;
    left.append(titleRow, summary);

    if (t.description) {
      const desc = document.createElement("p");
      desc.className = "ticket-desc";
      desc.textContent = t.description;
      left.appendChild(desc);
    }

    const actionBtn = document.createElement("button");
    actionBtn.type = "button";
    actionBtn.className = "btn btn-secondary";
    actionBtn.dataset.classifyKey = t.ticket_key;
    actionBtn.disabled = !modelReady;
    actionBtn.textContent = cls ? "Re-classify" : "Classify";
    actionBtn.addEventListener("click", () => classifyTickets([t.ticket_key], true));

    top.append(left, actionBtn);
    card.appendChild(top);

    if (t.comments && t.comments.length > 0) {
      const commentsBox = document.createElement("div");
      commentsBox.className = "ticket-comments";
      for (const c of t.comments) {
        const line = document.createElement("div");
        line.textContent = c;
        commentsBox.appendChild(line);
      }
      card.appendChild(commentsBox);
    }

    if (cls) {
      const grid = document.createElement("div");
      grid.className = "ticket-classifications";

      const catBox = document.createElement("div");
      catBox.className = "cls-box";
      catBox.innerHTML = `
        <span class="cls-box-label">Category (choice)</span>
        <span class="cls-box-value">${cls.category}</span>
        <span class="cls-box-sub">confidence: ${(cls.category_confidence * 100).toFixed(1)}%</span>
      `;

      const frustLabels = ["calm", "concerned", "frustrated", "critical"];
      const frustIdx = Math.min(3, Math.max(0, Math.round(cls.frustration_score)));
      const frustBox = document.createElement("div");
      frustBox.className = "cls-box";
      frustBox.innerHTML = `
        <span class="cls-box-label">Frustration (score 0..3)</span>
        <span class="cls-box-value ${cls.frustration_score >= 1.8 ? "cls-warn" : ""}">${cls.frustration_score.toFixed(2)} (${frustLabels[frustIdx]})</span>
        <span class="cls-box-sub">answer_conf: ${(cls.frustration_confidence * 100).toFixed(1)}%</span>
      `;

      const escBox = document.createElement("div");
      escBox.className = "cls-box";
      escBox.innerHTML = `
        <span class="cls-box-label">Escalation Risk (noul)</span>
        <span class="cls-box-value ${cls.escalation_risk >= 0.5 ? "cls-danger" : "cls-ok"}">${(cls.escalation_risk * 100).toFixed(1)}%</span>
        <span class="cls-box-sub">latency: ${cls.latency_ms.toFixed(0)} ms</span>
      `;

      grid.append(catBox, frustBox, escBox);
      card.appendChild(grid);

      const details = document.createElement("details");
      details.className = "raw-json-details";
      const sum = document.createElement("summary");
      sum.textContent = `Structured Response stored in SQLite (classified ${new Date(cls.classified_at).toLocaleTimeString()})`;
      const pre = document.createElement("pre");
      pre.textContent = JSON.stringify(cls, null, 2);
      details.append(sum, pre);
      card.appendChild(details);
    }

    els.ticketsList.appendChild(card);
  }
}

async function fetchTickets() {
  showSqliteError(null);
  const res = await fetch("/api/tickets");
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  ticketsData = data.tickets || [];
  renderTickets();
}

async function classifyTickets(ticketKeys, reclassify) {
  if (!modelReady) {
    showSqliteError("Model is still loading. Please wait until the status badge turns Ready.");
    return;
  }

  showSqliteError(null);
  const threshold = Number(els.sqliteThresholdSlider.value);
  els.classifyPendingBtn.disabled = true;
  els.reclassifyAllBtn.disabled = true;

  const prevText = els.classifyPendingBtn.textContent;
  els.classifyPendingBtn.textContent = "Classifying...";

  try {
    const res = await fetch("/api/tickets/classify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ticketKeys,
        reclassify,
        confidenceThreshold: threshold,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    ticketsData = data.tickets || [];
    renderTickets();
  } catch (err) {
    showSqliteError(err instanceof Error ? err.message : String(err));
  } finally {
    els.classifyPendingBtn.textContent = prevText;
    syncModelButtons();
  }
}

async function resetTickets() {
  showSqliteError(null);
  const res = await fetch("/api/tickets/reset", { method: "POST" });
  const data = await res.json();
  if (!res.ok) {
    showSqliteError(data.error || `HTTP ${res.status}`);
    return;
  }
  ticketsData = data.tickets || [];
  renderTickets();
}

async function submitNewTicket(e) {
  e.preventDefault();
  showSqliteError(null);

  const payload = {
    customer: els.newCustomer.value,
    priority: els.newPriority.value,
    summary: els.newSummary.value,
    comments: els.newComments.value,
  };

  try {
    const res = await fetch("/api/tickets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    els.addTicketForm.reset();
    els.addTicketForm.classList.add("hidden");
    await fetchTickets();
  } catch (err) {
    showSqliteError(err instanceof Error ? err.message : String(err));
  }
}

// =====================================================================
// Prompt Playground View
// =====================================================================

function parseStateValue(raw) {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return raw;
    }
  }
  return raw;
}

function updateStateModeHint() {
  const raw = els.stateInput.value.trim();
  if (!raw) {
    els.stateModeHint.textContent = "State is empty.";
    return;
  }
  if (raw.startsWith("{") || raw.startsWith("[")) {
    try {
      const parsed = JSON.parse(raw);
      els.stateModeHint.textContent = Array.isArray(parsed)
        ? `Parsed as JSON array (${parsed.length} items — Laya keeps newest end if truncated).`
        : "Parsed as JSON object.";
      return;
    } catch {
      els.stateModeHint.textContent = "Malformed JSON — will be sent as plain text unless fixed.";
      return;
    }
  }
  els.stateModeHint.textContent = "Sent as plain text string.";
}

function formatCriteriaText(q) {
  if (q.type === "choice") {
    if (Array.isArray(q.criteria)) return q.criteria.join("\n");
    if (q.criteria && typeof q.criteria === "object") {
      return Object.entries(q.criteria)
        .map(([k, v]) => (v ? `${k}: ${v}` : k))
        .join("\n");
    }
  }
  if (q.type === "score" && Array.isArray(q.criteria)) return q.criteria.join("\n");
  return "";
}

function parseCriteriaText(type, text) {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (type === "score") return lines;

  if (type === "choice") {
    const hasDescriptions = lines.some((l) => l.includes(":"));
    if (!hasDescriptions) return lines;
    const map = {};
    for (const line of lines) {
      const idx = line.indexOf(":");
      if (idx === -1) {
        map[line] = null;
      } else {
        const key = line.slice(0, idx).trim();
        const desc = line.slice(idx + 1).trim();
        if (key) map[key] = desc || null;
      }
    }
    return map;
  }

  return undefined;
}

function renderQuestionBuilder() {
  els.questionCards.innerHTML = "";
  for (const [key, q] of Object.entries(questionsObj)) {
    const card = document.createElement("div");
    card.className = "q-card";

    const top = document.createElement("div");
    top.className = "q-card-top";

    const keyInput = document.createElement("input");
    keyInput.className = "input-sm";
    keyInput.value = key;
    keyInput.placeholder = "question_key";
    keyInput.addEventListener("change", () => {
      const nextKey = keyInput.value.trim();
      if (!nextKey || nextKey === key) return;
      const rebuilt = {};
      for (const [k, v] of Object.entries(questionsObj)) {
        rebuilt[k === key ? nextKey : k] = v;
      }
      questionsObj = rebuilt;
      syncJsonFromBuilder();
      renderQuestionBuilder();
    });

    const typeSelect = document.createElement("select");
    typeSelect.className = "select-sm";
    for (const t of ["choice", "score", "noul"]) {
      const opt = document.createElement("option");
      opt.value = t;
      opt.textContent = t;
      if (q.type === t) opt.selected = true;
      typeSelect.appendChild(opt);
    }
    typeSelect.addEventListener("change", () => {
      const nextType = typeSelect.value;
      if (nextType === "choice") {
        questionsObj[key] = {
          type: "choice",
          instructions: q.instructions || "Pick one option.",
          criteria: { option_a: "first option", option_b: "second option" },
        };
      } else if (nextType === "score") {
        questionsObj[key] = {
          type: "score",
          instructions: q.instructions || "Rate on this scale.",
          criteria: ["low", "medium", "high"],
        };
      } else {
        questionsObj[key] = {
          type: "noul",
          instructions: q.instructions || "Is this true?",
        };
      }
      syncJsonFromBuilder();
      renderQuestionBuilder();
    });

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "btn btn-danger-ghost";
    removeBtn.textContent = "Remove";
    removeBtn.addEventListener("click", () => {
      delete questionsObj[key];
      syncJsonFromBuilder();
      renderQuestionBuilder();
    });

    top.append(keyInput, typeSelect, removeBtn);
    card.appendChild(top);

    const instrLabel = document.createElement("label");
    instrLabel.className = "q-field-label";
    instrLabel.textContent = "Instructions";
    card.appendChild(instrLabel);

    const instrInput = document.createElement("input");
    instrInput.className = "input-sm";
    instrInput.value = typeof q.instructions === "string" ? q.instructions : JSON.stringify(q.instructions);
    instrInput.addEventListener("input", () => {
      questionsObj[key].instructions = instrInput.value;
      syncJsonFromBuilder();
    });
    card.appendChild(instrInput);

    if (q.type === "choice" || q.type === "score") {
      const critLabel = document.createElement("label");
      critLabel.className = "q-field-label";
      critLabel.textContent =
        q.type === "choice"
          ? "Criteria (one option per line, optional 'label: description')"
          : "Ordered levels (one per line, lowest to highest)";
      card.appendChild(critLabel);

      const critArea = document.createElement("textarea");
      critArea.className = "code-editor";
      critArea.rows = 3;
      critArea.value = formatCriteriaText(q);
      critArea.addEventListener("input", () => {
        questionsObj[key].criteria = parseCriteriaText(q.type, critArea.value);
        syncJsonFromBuilder();
      });
      card.appendChild(critArea);
    }

    els.questionCards.appendChild(card);
  }
}

function syncJsonFromBuilder() {
  els.questionsJsonInput.value = JSON.stringify(questionsObj, null, 2);
}

function setQuestionMode(mode) {
  if (mode === questionMode) return;
  if (mode === "builder") {
    try {
      questionsObj = JSON.parse(els.questionsJsonInput.value);
      renderQuestionBuilder();
      showError(null);
    } catch {
      showError("Fix invalid Questions JSON before switching back to Builder mode.");
      return;
    }
  } else {
    syncJsonFromBuilder();
  }

  questionMode = mode;
  els.modeBuilderBtn.classList.toggle("active", mode === "builder");
  els.modeJsonBtn.classList.toggle("active", mode === "json");
  els.questionsBuilder.classList.toggle("hidden", mode !== "builder");
  els.questionsJsonWrap.classList.toggle("hidden", mode !== "json");
}

function addQuestion(type) {
  let idx = Object.keys(questionsObj).length + 1;
  let key = `${type}_${idx}`;
  while (key in questionsObj) {
    idx += 1;
    key = `${type}_${idx}`;
  }

  if (type === "choice") {
    questionsObj[key] = {
      type: "choice",
      instructions: "Choose the best matching category.",
      criteria: { option_a: "first option", option_b: "second option" },
    };
  } else if (type === "score") {
    questionsObj[key] = {
      type: "score",
      instructions: "Score on this ordered scale.",
      criteria: ["low", "medium", "high"],
    };
  } else {
    questionsObj[key] = {
      type: "noul",
      instructions: "Does this statement apply?",
    };
  }

  syncJsonFromBuilder();
  renderQuestionBuilder();
}

function applyPreset(preset) {
  for (const btn of els.presetButtons.querySelectorAll(".preset-btn")) {
    btn.classList.toggle("active", btn.dataset.presetId === preset.id);
  }

  els.stateInput.value =
    typeof preset.state === "string" ? preset.state : JSON.stringify(preset.state, null, 2);
  updateStateModeHint();

  questionsObj = structuredClone(preset.questions);
  syncJsonFromBuilder();
  renderQuestionBuilder();

  els.thresholdSlider.value = String(preset.confidenceThreshold);
  els.thresholdValue.textContent = preset.confidenceThreshold.toFixed(2);
  showError(null);
}

function renderProbabilityBar(label, prob, isWinner) {
  const row = document.createElement("div");
  row.className = "prob-row";

  const lbl = document.createElement("span");
  lbl.className = "prob-label";
  lbl.textContent = label;
  lbl.title = label;

  const track = document.createElement("div");
  track.className = "prob-track";

  const fill = document.createElement("div");
  fill.className = `prob-fill${isWinner ? " winner" : ""}`;
  fill.style.width = `${Math.max(0, Math.min(100, prob * 100)).toFixed(1)}%`;
  track.appendChild(fill);

  const pct = document.createElement("span");
  pct.className = "prob-pct";
  pct.textContent = `${(prob * 100).toFixed(1)}%`;

  row.append(lbl, track, pct);
  return row;
}

function renderResults() {
  if (!lastEvalResponse) return;
  const { result, latencyMs } = lastEvalResponse;
  const threshold = Number(els.thresholdSlider.value);

  els.resultsEmpty.classList.add("hidden");
  els.metricsRow.classList.remove("hidden");
  els.rawJsonDetails.classList.remove("hidden");

  els.metricLatency.textContent = `${latencyMs.toFixed(1)} ms`;
  els.metricTokens.textContent = String(result.usage.input_tokens);
  els.metricQuestions.textContent = String(Object.keys(result.answers).length);
  els.metricModel.textContent = result.model;
  els.rawJsonOutput.textContent = JSON.stringify(result, null, 2);

  els.resultsList.innerHTML = "";
  let escalatedCount = 0;

  for (const [key, ans] of Object.entries(result.answers)) {
    const passed = ans.answer_confidence >= threshold;
    if (!passed) escalatedCount += 1;

    const card = document.createElement("div");
    card.className = `result-card${passed ? "" : " gated"}`;

    const header = document.createElement("div");
    header.className = "result-header";

    const title = document.createElement("div");
    title.className = "result-title";
    const h3 = document.createElement("h3");
    h3.textContent = key;
    const typeChip = document.createElement("span");
    typeChip.className = "type-chip";
    typeChip.textContent = ans.type;
    title.append(h3, typeChip);

    const gateChip = document.createElement("span");
    gateChip.className = `gate-chip ${passed ? "gate-pass" : "gate-escalate"}`;
    gateChip.textContent = passed
      ? `System-1 Pass (${(ans.answer_confidence * 100).toFixed(1)}%)`
      : `Escalate (< ${(threshold * 100).toFixed(0)}%)`;

    header.append(title, gateChip);
    card.appendChild(header);

    const headline = document.createElement("div");
    headline.className = "headline-answer";
    const val = document.createElement("span");
    val.className = "headline-value";
    const conf = document.createElement("span");
    conf.className = "headline-conf";

    if (ans.type === "choice") {
      val.textContent = ans.choice;
      conf.textContent = `answer_conf: ${ans.answer_confidence.toFixed(4)} · entropy_conf: ${ans.confidence.toFixed(4)}`;
    } else if (ans.type === "score") {
      const maxIdx = Math.max(1, Object.keys(ans.legend).length - 1);
      val.textContent = `${ans.score.toFixed(2)} / ${maxIdx}`;
      conf.textContent = `answer_conf: ${ans.answer_confidence.toFixed(4)} · entropy_conf: ${ans.confidence.toFixed(4)}`;
    } else {
      val.textContent = `P(true) = ${(ans.noul * 100).toFixed(1)}%`;
      conf.textContent = `answer_conf: ${ans.answer_confidence.toFixed(4)}`;
    }

    headline.append(val, conf);
    card.appendChild(headline);

    const probs = document.createElement("div");
    probs.className = "prob-list";

    if (ans.type === "choice") {
      const sorted = Object.entries(ans.probabilities).sort((a, b) => b[1] - a[1]);
      for (const [opt, p] of sorted) {
        probs.appendChild(renderProbabilityBar(opt, p, opt === ans.choice));
      }
    } else if (ans.type === "score") {
      const entries = Object.entries(ans.probabilities);
      const bestEntry = entries.reduce((a, b) => (b[1] > a[1] ? b : a), entries[0]);
      for (const [idx, p] of entries) {
        const label = ans.legend[idx] ? `${idx}: ${ans.legend[idx]}` : idx;
        probs.appendChild(renderProbabilityBar(label, p, idx === bestEntry[0]));
      }
    } else {
      probs.appendChild(renderProbabilityBar("true", ans.noul, ans.noul >= 0.5));
      probs.appendChild(renderProbabilityBar("false", 1 - ans.noul, ans.noul < 0.5));
    }

    card.appendChild(probs);
    els.resultsList.appendChild(card);
  }

  els.gateSummary.classList.remove("hidden");
  if (escalatedCount === 0) {
    els.gateSummary.className = "gate-summary gate-pass";
    els.gateSummary.textContent = "All answers cleared System-1 gate";
  } else {
    els.gateSummary.className = "gate-summary gate-escalate";
    els.gateSummary.textContent = `${escalatedCount} question(s) below threshold`;
  }
}

async function evaluate() {
  if (!modelReady) {
    showError("Model is still loading. Please wait until the status badge turns Ready.");
    return;
  }

  let questionsToSend = questionsObj;
  if (questionMode === "json") {
    try {
      questionsToSend = JSON.parse(els.questionsJsonInput.value);
    } catch {
      showError("Invalid JSON in Questions editor.");
      return;
    }
  }

  const stateToSend = parseStateValue(els.stateInput.value);
  const threshold = Number(els.thresholdSlider.value);

  showError(null);
  els.evaluateBtn.disabled = true;
  const originalLabel = els.evaluateBtn.innerHTML;
  els.evaluateBtn.textContent = "Evaluating...";

  try {
    const res = await fetch("/api/evaluate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        state: stateToSend,
        questions: questionsToSend,
        confidenceThreshold: threshold,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    lastEvalResponse = data;
    renderResults();
  } catch (err) {
    showError(err instanceof Error ? err.message : String(err));
  } finally {
    els.evaluateBtn.innerHTML = originalLabel;
    syncModelButtons();
  }
}

async function pollHealth() {
  try {
    const res = await fetch("/api/health");
    const health = await res.json();

    if (health.status === "ready") {
      modelReady = true;
      els.modelBadge.className = "badge badge-ready";
      els.modelStatusText.textContent = `Model Ready (${health.loadTimeMs} ms)`;
      if (health.config) {
        els.modelMeta.textContent = `max_len=${health.config.max_len} · head_max_len=${health.config.head_max_len}`;
        els.modelMeta.classList.remove("hidden");
      }
      syncModelButtons();
      return;
    }

    if (health.status === "error") {
      modelReady = false;
      els.modelBadge.className = "badge badge-error";
      els.modelStatusText.textContent = "Model Error";
      showError(health.error || "Model failed to load.");
      showSqliteError(health.error || "Model failed to load.");
      syncModelButtons();
      return;
    }

    modelReady = false;
    syncModelButtons();
    els.modelBadge.className = "badge badge-loading";
    if (health.progress && health.progress.total) {
      const pct = ((health.progress.received / health.progress.total) * 100).toFixed(0);
      els.modelStatusText.textContent = `Downloading ${health.progress.file}: ${pct}%`;
    } else {
      els.modelStatusText.textContent = "Loading ONNX model...";
    }
    setTimeout(pollHealth, 1000);
  } catch {
    setTimeout(pollHealth, 1500);
  }
}

async function init() {
  syncModelButtons();

  // Main tabs
  els.navSqliteBtn.addEventListener("click", () => switchMainTab("sqlite"));
  els.navPlaygroundBtn.addEventListener("click", () => switchMainTab("playground"));

  // SQLite Pipeline listeners
  els.classifyPendingBtn.addEventListener("click", () => classifyTickets(undefined, false));
  els.reclassifyAllBtn.addEventListener("click", () => classifyTickets(undefined, true));
  els.resetTicketsBtn.addEventListener("click", resetTickets);
  els.toggleAddTicketBtn.addEventListener("click", () => {
    els.addTicketForm.classList.toggle("hidden");
  });
  els.cancelAddTicketBtn.addEventListener("click", () => {
    els.addTicketForm.classList.add("hidden");
  });
  els.addTicketForm.addEventListener("submit", submitNewTicket);

  els.sqliteThresholdSlider.addEventListener("input", () => {
    els.sqliteThresholdValue.textContent = Number(els.sqliteThresholdSlider.value).toFixed(2);
    renderTickets();
  });

  for (const pill of els.ticketFilters.querySelectorAll(".filter-pill")) {
    pill.addEventListener("click", () => {
      ticketFilter = pill.dataset.filter;
      for (const p of els.ticketFilters.querySelectorAll(".filter-pill")) {
        p.classList.toggle("active", p === pill);
      }
      renderTickets();
    });
  }

  // Playground listeners
  els.stateInput.addEventListener("input", updateStateModeHint);
  els.formatStateBtn.addEventListener("click", () => {
    try {
      const parsed = JSON.parse(els.stateInput.value);
      els.stateInput.value = JSON.stringify(parsed, null, 2);
      updateStateModeHint();
      showError(null);
    } catch {
      showError("State is plain text or invalid JSON — cannot format as JSON.");
    }
  });

  els.modeBuilderBtn.addEventListener("click", () => setQuestionMode("builder"));
  els.modeJsonBtn.addEventListener("click", () => setQuestionMode("json"));

  for (const btn of document.querySelectorAll("[data-add-type]")) {
    btn.addEventListener("click", () => addQuestion(btn.dataset.addType));
  }

  els.thresholdSlider.addEventListener("input", () => {
    els.thresholdValue.textContent = Number(els.thresholdSlider.value).toFixed(2);
    if (lastEvalResponse) renderResults();
  });

  els.evaluateBtn.addEventListener("click", evaluate);
  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter" && !els.playgroundView.classList.contains("hidden")) {
      e.preventDefault();
      evaluate();
    }
  });

  const [presetsRes] = await Promise.all([fetch("/api/presets"), fetchTickets()]);
  const presetsJson = await presetsRes.json();
  presets = presetsJson.presets || [];

  for (const preset of presets) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "preset-btn";
    btn.dataset.presetId = preset.id;
    btn.textContent = preset.name;
    btn.title = preset.description;
    btn.addEventListener("click", () => applyPreset(preset));
    els.presetButtons.appendChild(btn);
  }

  if (presets.length > 0) {
    applyPreset(presets[0]);
  }

  await pollHealth();
}

init();
