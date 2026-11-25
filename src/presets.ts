import type { Question } from "@receptron/laya";

export interface SamplePreset {
  id: string;
  name: string;
  description: string;
  confidenceThreshold: number;
  state: unknown;
  questions: Record<string, Question>;
}

export const SAMPLE_PRESETS: SamplePreset[] = [
  {
    id: "support-triage",
    name: "Support Ticket Triage",
    description:
      "Routes a customer billing complaint across department (choice), urgency (score), and churn risk (noul).",
    confidenceThreshold: 0.75,
    state: {
      subject: "Refund not received",
      body: "I cancelled my subscription two weeks ago and I still have not received my refund. This is the third time I am writing. If this is not resolved I will dispute the charge with my bank.",
    },
    questions: {
      department: {
        type: "choice",
        instructions: "Which team should handle this ticket?",
        criteria: {
          billing: "payments, refunds, invoices",
          support: "product help and bugs",
          sales: "new purchases and upgrades",
        },
      },
      urgency: {
        type: "score",
        instructions: "How urgent is this ticket?",
        criteria: ["not urgent", "somewhat urgent", "urgent", "critical"],
      },
      churn_risk: {
        type: "noul",
        instructions: "Is the customer likely to cancel or dispute?",
      },
    },
  },
  {
    id: "chat-escalation",
    name: "Conversation Escalation",
    description:
      "Evaluates a multi-turn conversation array (Laya keeps the newest end of list states) for intent and human handoff.",
    confidenceThreshold: 0.75,
    state: [
      { role: "user", content: "Hi, my API key keeps returning 401 since I rotated it." },
      { role: "assistant", content: "Have you updated the Authorization header in your environment?" },
      { role: "user", content: "Yes, twice! Production is down for all our enterprise users right now and nobody is helping." },
    ],
    questions: {
      intent: {
        type: "choice",
        instructions: "What is the primary user intent in the latest message?",
        criteria: {
          outage_escalation: "production outage or urgent blocker needing immediate help",
          how_to: "asking how to configure or use a feature",
          account_billing: "pricing, plan, or invoice inquiry",
          feedback: "feature request or general comment",
        },
      },
      frustration: {
        type: "score",
        instructions: "Rate the user's level of frustration.",
        criteria: ["calm", "mildly annoyed", "frustrated", "angry"],
      },
      needs_human: {
        type: "noul",
        instructions: "Should this conversation be escalated immediately to a human engineer?",
        criteria: {
          true: "escalate to on-call engineer",
          false: "automated assistant can continue",
        },
      },
    },
  },
  {
    id: "issue-routing",
    name: "Engineering Issue Routing",
    description:
      "Classifies a bug report JSON payload by area, severity rubric, and whether it signals a breaking regression.",
    confidenceThreshold: 0.7,
    state: {
      title: "v2.4.0 breaks OAuth callback on Windows behind corporate proxy",
      labels: ["bug", "auth"],
      body: "After upgrading from 2.3.1 to 2.4.0, login fails with ERR_INVALID_REDIRECT_URI whenever HTTP_PROXY is set. Reverting to 2.3.1 fixes it immediately.",
    },
    questions: {
      area: {
        type: "choice",
        instructions: "Which engineering area owns this issue?",
        criteria: {
          auth: "authentication, OAuth, tokens, sessions",
          networking: "HTTP client, proxies, TLS, DNS",
          ui: "frontend layout, rendering, accessibility",
          docs: "documentation and examples",
        },
      },
      severity: {
        type: "score",
        instructions: "Assess the operational severity of this bug.",
        criteria: ["cosmetic", "minor", "major", "blocker"],
      },
      is_regression: {
        type: "noul",
        instructions: "Does the report describe a regression introduced in a recent release?",
      },
    },
  },
  {
    id: "content-moderation",
    name: "Content Moderation",
    description:
      "Scores a raw text post across safety category, toxicity level, and review flag.",
    confidenceThreshold: 0.8,
    state: "Great tutorial! Thanks for sharing the benchmark scripts—saved our team hours of debugging this afternoon.",
    questions: {
      classification: {
        type: "choice",
        instructions: "Classify the message.",
        criteria: {
          constructive: "helpful, polite, or appreciative feedback",
          spam: "unsolicited promotion or bot link",
          harassment: "personal attack, insult, or threat",
          off_topic: "unrelated to the discussion",
        },
      },
      toxicity: {
        type: "score",
        instructions: "Rate the toxicity of this comment.",
        criteria: ["safe", "mild", "moderate", "severe"],
      },
      requires_review: {
        type: "noul",
        instructions: "Should a human moderator review this message before publishing?",
      },
    },
  },
];
