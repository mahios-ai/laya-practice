import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import type { Question } from "@receptron/laya";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_DB_PATH = path.resolve(__dirname, "../data/jira_edp.sqlite");

export interface JiraTicketRow {
  id: number;
  ticket_key: string;
  customer: string;
  summary: string;
  description: string;
  priority: string;
  status: string;
  comments: string[];
  synced_at: string;
  classification: JiraClassificationRecord | null;
}

export interface JiraClassificationRecord {
  ticket_key: string;
  category: string;
  category_confidence: number;
  frustration_score: number;
  frustration_confidence: number;
  escalation_risk: number;
  escalation_confidence: number;
  needs_review: boolean;
  latency_ms: number;
  raw_result: unknown;
  classified_at: string;
}

export const JIRA_CLASSIFICATION_QUESTIONS = {
  category: {
    type: "choice",
    instructions: "Classify the primary issue described in this Jira ticket and customer comments.",
    criteria: {
      auth_sso: "login failure, SAML, OAuth, SSO, permissions, or locked-out users",
      billing_refund: "invoices, duplicate charges, refunds, or subscription billing",
      data_sync_edp: "missing records, Snowflake sync lag, ETL or pipeline failures",
      ui_bug: "frontend layout glitch, chart rendering, or broken UI control",
      feature_request: "enhancement, new export format, or product improvement idea",
    },
  },
  customer_frustration: {
    type: "score",
    instructions: "Rate the customer's frustration level based on their comments.",
    criteria: ["calm", "concerned", "frustrated", "critical_escalation"],
  },
  escalation_risk: {
    type: "noul",
    instructions: "Is the customer threatening SLA breach, executive escalation, or cancellation?",
  },
} satisfies Record<string, Question>;

interface SeedTicket {
  ticket_key: string;
  customer: string;
  summary: string;
  description: string;
  priority: string;
  status: string;
  comments: string[];
}

const SEED_TICKETS: SeedTicket[] = [
  {
    ticket_key: "SUP-1482",
    customer: "Acme FinTech",
    summary: "SSO login failing for all EU users after deployment",
    description: "Users receive Invalid SAML Assertion when signing in via Okta.",
    priority: "High",
    status: "Open",
    comments: [
      "Customer: Our entire EU operations team has been locked out since 08:30 UTC.",
      "Support: Reviewing SAML assertion logs now.",
      "Customer: Still down after 4 hours. Our VP is asking for an SLA credit if this is not restored today.",
    ],
  },
  {
    ticket_key: "SUP-1483",
    customer: "Northwind Retail",
    summary: "Charged twice for annual Enterprise renewal",
    description: "Billing portal shows two posted charges on card ending 4421.",
    priority: "High",
    status: "Open",
    comments: [
      "Customer: I cancelled auto-renew last month, yet we were billed twice yesterday.",
      "Customer: Please refund the duplicate charge by Friday or we will initiate a bank dispute.",
    ],
  },
  {
    ticket_key: "SUP-1484",
    customer: "Helios Logistics",
    summary: "Nightly Jira -> Snowflake EDP sync missing closed tickets",
    description: "Records updated after 23:00 UTC are absent in ANALYTICS.JIRA_ISSUES.",
    priority: "Medium",
    status: "In Progress",
    comments: [
      "Customer: Our morning executive dashboard is missing ~180 tickets from yesterday.",
      "Support: Investigating the Snowflake connector watermark offset.",
    ],
  },
  {
    ticket_key: "SUP-1485",
    customer: "BluePeak Health",
    summary: "Table column headers wrap awkwardly on 13-inch laptops",
    description: "Minor CSS overlap in the weekly summary view.",
    priority: "Low",
    status: "Open",
    comments: [
      "Customer: Not urgent at all—just noticed the Status header wraps onto two lines on smaller screens.",
    ],
  },
  {
    ticket_key: "SUP-1486",
    customer: "Stratos Media",
    summary: "Add Parquet export option for scheduled reports",
    description: "Would love Parquet alongside CSV for downstream data science notebooks.",
    priority: "Low",
    status: "Backlog",
    comments: [
      "Customer: CSV works fine for now, but Parquet export would save us a conversion step next quarter. Thanks!",
    ],
  },
  {
    ticket_key: "SUP-1487",
    customer: "Vanguard Ops",
    summary: "Dashboard looks weird after yesterday",
    description: "Something changed in the afternoon view.",
    priority: "Medium",
    status: "Open",
    comments: [
      "Customer: Can someone take a look when you have a minute?",
    ],
  },
];

export class JiraSqliteStore {
  private readonly db: DatabaseSync;

  constructor(dbPath = process.env.SQLITE_DB_PATH ?? DEFAULT_DB_PATH) {
    mkdirSync(path.dirname(dbPath), { recursive: true });
    this.db = new DatabaseSync(dbPath);
    this.initSchema();
    this.seedIfEmpty();
  }

  private initSchema(): void {
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON;

      CREATE TABLE IF NOT EXISTS jira_tickets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ticket_key TEXT NOT NULL UNIQUE,
        customer TEXT NOT NULL,
        summary TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        priority TEXT NOT NULL DEFAULT 'Medium',
        status TEXT NOT NULL DEFAULT 'Open',
        comments_json TEXT NOT NULL DEFAULT '[]',
        synced_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS jira_classifications (
        ticket_key TEXT PRIMARY KEY,
        category TEXT NOT NULL,
        category_confidence REAL NOT NULL,
        frustration_score REAL NOT NULL,
        frustration_confidence REAL NOT NULL,
        escalation_risk REAL NOT NULL,
        escalation_confidence REAL NOT NULL,
        needs_review INTEGER NOT NULL,
        latency_ms REAL NOT NULL,
        raw_result_json TEXT NOT NULL,
        classified_at TEXT NOT NULL,
        FOREIGN KEY (ticket_key) REFERENCES jira_tickets(ticket_key) ON DELETE CASCADE
      );
    `);
  }

  private seedIfEmpty(): void {
    const row = this.db.prepare("SELECT COUNT(*) AS count FROM jira_tickets").get() as { count: number };
    if (row.count === 0) {
      this.insertSeedTickets();
    }
  }

  private insertSeedTickets(): void {
    const stmt = this.db.prepare(`
      INSERT INTO jira_tickets (ticket_key, customer, summary, description, priority, status, comments_json, synced_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const now = new Date().toISOString();
    for (const t of SEED_TICKETS) {
      stmt.run(t.ticket_key, t.customer, t.summary, t.description, t.priority, t.status, JSON.stringify(t.comments), now);
    }
  }

  listTickets(keys?: string[]): JiraTicketRow[] {
    const baseSql = `
      SELECT
        t.id,
        t.ticket_key,
        t.customer,
        t.summary,
        t.description,
        t.priority,
        t.status,
        t.comments_json,
        t.synced_at,
        c.category,
        c.category_confidence,
        c.frustration_score,
        c.frustration_confidence,
        c.escalation_risk,
        c.escalation_confidence,
        c.needs_review,
        c.latency_ms,
        c.raw_result_json,
        c.classified_at
      FROM jira_tickets t
      LEFT JOIN jira_classifications c ON t.ticket_key = c.ticket_key
    `;

    let rows: Record<string, unknown>[];
    if (keys && keys.length > 0) {
      const placeholders = keys.map(() => "?").join(", ");
      rows = this.db
        .prepare(`${baseSql} WHERE t.ticket_key IN (${placeholders}) ORDER BY t.id ASC`)
        .all(...keys) as Record<string, unknown>[];
    } else {
      rows = this.db.prepare(`${baseSql} ORDER BY t.id ASC`).all() as Record<string, unknown>[];
    }

    return rows.map((r) => ({
      id: Number(r.id),
      ticket_key: String(r.ticket_key),
      customer: String(r.customer),
      summary: String(r.summary),
      description: String(r.description),
      priority: String(r.priority),
      status: String(r.status),
      comments: JSON.parse(String(r.comments_json)) as string[],
      synced_at: String(r.synced_at),
      classification: r.classified_at
        ? {
            ticket_key: String(r.ticket_key),
            category: String(r.category),
            category_confidence: Number(r.category_confidence),
            frustration_score: Number(r.frustration_score),
            frustration_confidence: Number(r.frustration_confidence),
            escalation_risk: Number(r.escalation_risk),
            escalation_confidence: Number(r.escalation_confidence),
            needs_review: Number(r.needs_review) === 1,
            latency_ms: Number(r.latency_ms),
            raw_result: JSON.parse(String(r.raw_result_json)),
            classified_at: String(r.classified_at),
          }
        : null,
    }));
  }

  addTicket(input: {
    ticket_key?: string;
    customer: string;
    summary: string;
    description?: string;
    priority?: string;
    status?: string;
    comments: string[];
  }): JiraTicketRow {
    const maxRow = this.db.prepare("SELECT COALESCE(MAX(id), 0) AS maxId FROM jira_tickets").get() as { maxId: number };
    const key = input.ticket_key?.trim() || `SUP-${1482 + maxRow.maxId}`;
    const now = new Date().toISOString();

    this.db
      .prepare(
        `INSERT INTO jira_tickets (ticket_key, customer, summary, description, priority, status, comments_json, synced_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        key,
        input.customer.trim(),
        input.summary.trim(),
        (input.description ?? "").trim(),
        input.priority?.trim() || "Medium",
        input.status?.trim() || "Open",
        JSON.stringify(input.comments),
        now,
      );

    return this.listTickets([key])[0];
  }

  saveClassification(record: JiraClassificationRecord): void {
    this.db
      .prepare(
        `INSERT INTO jira_classifications (
           ticket_key, category, category_confidence,
           frustration_score, frustration_confidence,
           escalation_risk, escalation_confidence,
           needs_review, latency_ms, raw_result_json, classified_at
         )
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(ticket_key) DO UPDATE SET
           category = excluded.category,
           category_confidence = excluded.category_confidence,
           frustration_score = excluded.frustration_score,
           frustration_confidence = excluded.frustration_confidence,
           escalation_risk = excluded.escalation_risk,
           escalation_confidence = excluded.escalation_confidence,
           needs_review = excluded.needs_review,
           latency_ms = excluded.latency_ms,
           raw_result_json = excluded.raw_result_json,
           classified_at = excluded.classified_at`,
      )
      .run(
        record.ticket_key,
        record.category,
        record.category_confidence,
        record.frustration_score,
        record.frustration_confidence,
        record.escalation_risk,
        record.escalation_confidence,
        record.needs_review ? 1 : 0,
        record.latency_ms,
        JSON.stringify(record.raw_result),
        record.classified_at,
      );
  }

  reset(): void {
    this.db.exec("DELETE FROM jira_classifications; DELETE FROM jira_tickets;");
    this.insertSeedTickets();
  }

  close(): void {
    this.db.close();
  }
}
