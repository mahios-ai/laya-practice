# Laya Decision Studio (`laya-practice`)

An interactive TypeScript web app, HTTP API, and CLI sample built with [`@receptron/laya`](https://github.com/receptron/laya) — running the **Laya** System-1 decision model locally in Node.js via ONNX Runtime without Python.

## Features

- **Single-pass structured decisions**: Evaluate `choice`, `score`, and `noul` (calibrated yes/no probability) questions together in one forward pass via `laya.systemOne(state, questions)`.
- **Interactive Web Studio**:
  - Load real-world presets (Support Ticket Triage, Conversation Escalation, Engineering Issue Routing, Content Moderation).
  - Edit `state` as JSON objects, conversation arrays, or plain text.
  - Build or edit typed questions visually or via raw JSON.
  - Experiment with **System-1 Confidence Gating** (`answer_confidence` threshold slider) to see which decisions can execute immediately vs. escalate to a System-2 LLM/human.
- **HTTP API**: `GET /api/health`, `GET /api/presets`, `POST /api/evaluate`.
- **CLI Demo**: Run all presets from the terminal with latency and gating diagnostics.

## Prerequisites

- **Node.js 20+**
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

# Or run the standalone CLI benchmark across all presets
npm run cli

# Type-check & compile TypeScript
npm run typecheck
npm run build
```

## Environment Variables

| Variable | Default | Description |
| --- | --- | --- |
| `PORT` | `3000` | HTTP server port |
| `HOST` | `127.0.0.1` | HTTP bind host |
| `LAYA_CACHE` | `~/.cache/receptron-laya` | Local cache directory for downloaded Hugging Face weights |
| `LAYA_MODEL_DIR` | _(unset)_ | Path to a local ONNX bundle directory (skips Hugging Face download) |
| `LAYA_SUBFOLDER` | _(unset)_ | Hugging Face repo subfolder (e.g., `multilingual`) |

## API Example

```bash
curl -X POST http://127.0.0.1:3000/api/evaluate \
  -H "Content-Type: application/json" \
  -d '{
    "confidenceThreshold": 0.75,
    "state": {
      "subject": "Refund not received",
      "body": "I cancelled two weeks ago and still have no refund."
    },
    "questions": {
      "department": {
        "type": "choice",
        "instructions": "Which team should handle this ticket?",
        "criteria": {
          "billing": "payments, refunds, invoices",
          "support": "product help and bugs"
        }
      },
      "urgency": {
        "type": "score",
        "instructions": "How urgent is this ticket?",
        "criteria": ["not urgent", "somewhat urgent", "urgent", "critical"]
      },
      "churn_risk": {
        "type": "noul",
        "instructions": "Is the customer likely to cancel or dispute?"
      }
    }
  }'
```
