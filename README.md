# Laya Decision Studio (`laya-practice`)

An interactive 100% local TypeScript web app, HTTP API, local SQLite pipeline, and CLI sample built with [`@receptron/laya`](https://github.com/receptron/laya) — running the **Laya** System-1 decision model locally in Node.js via ONNX Runtime without Python or any cloud APIs.

> **Architecture Proposal:** See [PROPOSED_SOLUTION.md](PROPOSED_SOLUTION.md) for the full AWS multi-source Support Shift Dashboard architecture (Snowflake, Jira, Seeq, Smartsheet, SharePoint, OneNote, Outlook) with Dynamic Skills, Dynamic Tooling, Agent Boundaries, and Laya + Bedrock hybrid scoring.

## Features

- **Local Jira + SQLite Pipeline (`node:sqlite` + Laya)**:
  - Seeds a local SQLite database ([`data/jira_edp.sqlite`](src/db.ts)) mimicking Jira tickets & customer comment threads synced into an EDP/warehouse.
  - Clicking **Classify Unclassified** (or calling `POST /api/tickets/classify`) reads rows from SQLite, classifies each ticket's `category` (`choice`), `customer_frustration` (`score`), and `escalation_risk` (`noul`) in a single forward pass, stores the structured results back into SQLite, and returns the structured JSON response.
  - Supports adding new Jira tickets (`POST /api/tickets`), filtering by escalation risk or confidence gate (`Needs Review`), and resetting the demo DB (`POST /api/tickets/reset`).
- **Interactive Prompt Playground**:
  - Load presets (Support Ticket Triage, Conversation Escalation, Engineering Issue Routing, Content Moderation), edit states/questions, and test System-1 confidence gating.
- **CLI Demo**: Run all presets from the terminal with latency and gating diagnostics.

## Prerequisites

- **Node.js 22.5+** (uses built-in `node:sqlite` and `@receptron/laya`)
- **~2 GB RAM** for the loaded ONNX session
- **~1.7 GB disk space** for the cached ONNX model weights (`~/.cache/receptron-laya`, overridable via `LAYA_CACHE`)

## Setup & Usage

```bash
# 1. Install dependencies
npm install

# 2. (Optional) Pre-download the ~1.7 GB ONNX model weights
npm run download-model

# 3. Start the web studio & API server (http://127.0.0.1:3000)
npm start

# Or run the standalone Jira + SQLite classification sample
npm run jira-sample

# Or run the standalone CLI benchmark across all presets
npm run cli

# Type-check & compile TypeScript
npm run typecheck
npm run build
```

## Local SQLite Pipeline API Endpoints

- `GET /api/tickets` — List all Jira tickets and persisted classifications from `data/jira_edp.sqlite`.
- `POST /api/tickets` — Insert a new Jira ticket (`{ customer, summary, priority?, comments }`) into SQLite.
- `POST /api/tickets/classify` — Query SQLite tickets, run `laya.systemOne()`, persist structured results in `jira_classifications`, and return the updated records.
- `POST /api/tickets/reset` — Reset `data/jira_edp.sqlite` back to the 6 seeded Jira tickets.

### Example `curl` Flow

```bash
# Classify all unclassified Jira tickets in local SQLite
curl -X POST http://127.0.0.1:3000/api/tickets/classify \
  -H "Content-Type: application/json" \
  -d '{"confidenceThreshold": 0.75}'
```
