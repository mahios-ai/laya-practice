import { Laya } from "@receptron/laya";
import { JIRA_CLASSIFICATION_QUESTIONS, JiraSqliteStore } from "./db.js";

/**
 * Minimal standalone sample:
 *   Local SQLite (data/jira_edp.sqlite) -> Laya.systemOne() -> Structured Response + SQLite Update
 */
async function main(): Promise<void> {
  const store = new JiraSqliteStore();
  const tickets = store.listTickets();
  console.log(`Loaded ${tickets.length} Jira tickets from local SQLite.`);

  const laya = await Laya.load({
    modelDir: process.env.LAYA_MODEL_DIR,
    cacheDir: process.env.LAYA_CACHE,
  });

  const confidenceThreshold = 0.75;

  for (const ticket of tickets) {
    const t0 = performance.now();
    const result = await laya.systemOne(
      {
        key: ticket.ticket_key,
        customer: ticket.customer,
        priority: ticket.priority,
        summary: ticket.summary,
        description: ticket.description,
        comments: ticket.comments,
      },
      JIRA_CLASSIFICATION_QUESTIONS,
    );
    const latencyMs = Number((performance.now() - t0).toFixed(2));

    const structuredResponse = {
      ticket_key: ticket.ticket_key,
      category: result.answers.category.choice,
      category_confidence: result.answers.category.answer_confidence,
      frustration_score: result.answers.customer_frustration.score,
      frustration_confidence: result.answers.customer_frustration.answer_confidence,
      escalation_risk: result.answers.escalation_risk.noul,
      escalation_confidence: result.answers.escalation_risk.answer_confidence,
      needs_review: result.answers.category.answer_confidence < confidenceThreshold,
      latency_ms: latencyMs,
      raw_result: result,
      classified_at: new Date().toISOString(),
    };

    store.saveClassification(structuredResponse);

    console.log(`\n[${ticket.ticket_key}] ${ticket.summary}`);
    console.log(
      JSON.stringify(
        {
          category: structuredResponse.category,
          category_confidence: Number(structuredResponse.category_confidence.toFixed(4)),
          frustration_score: Number(structuredResponse.frustration_score.toFixed(4)),
          escalation_risk: Number(structuredResponse.escalation_risk.toFixed(4)),
          needs_review: structuredResponse.needs_review,
          latency_ms: structuredResponse.latency_ms,
        },
        null,
        2,
      ),
    );
  }

  await laya.close();
  store.close();
}

main().catch((err) => {
  console.error("Jira SQLite sample failed:", err);
  process.exit(1);
});
