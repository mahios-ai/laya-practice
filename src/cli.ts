import { Laya } from "@receptron/laya";
import { SAMPLE_PRESETS } from "./presets.js";

async function main(): Promise<void> {
  console.log("Loading Laya ONNX model...");
  const tLoad = performance.now();
  const laya = await Laya.load({
    modelDir: process.env.LAYA_MODEL_DIR,
    subfolder: process.env.LAYA_SUBFOLDER,
    cacheDir: process.env.LAYA_CACHE,
    onProgress: ({ file, received, total }) => {
      if (total) {
        const pct = ((received / total) * 100).toFixed(0);
        process.stderr.write(`\rDownloading ${file}: ${pct}%   `);
      }
    },
  });
  process.stderr.write("\n");
  console.log(`Model loaded in ${(performance.now() - tLoad).toFixed(0)} ms from ${laya.modelDir}`);

  for (const preset of SAMPLE_PRESETS) {
    console.log(`\n=== ${preset.name} ===`);
    const t0 = performance.now();
    const result = await laya.systemOne(preset.state, preset.questions);
    const elapsed = (performance.now() - t0).toFixed(1);

    console.log(`Inference: ${elapsed} ms | Input tokens: ${result.usage.input_tokens}`);
    for (const [key, answer] of Object.entries(result.answers)) {
      const gate = answer.answer_confidence >= preset.confidenceThreshold ? "SYSTEM-1 OK" : "ESCALATE TO SYSTEM-2";
      if (answer.type === "choice") {
        console.log(
          `  ${key} [choice]: ${answer.choice} (answer_confidence=${answer.answer_confidence.toFixed(4)}, ${gate})`,
        );
      } else if (answer.type === "score") {
        console.log(
          `  ${key} [score]: ${answer.score.toFixed(4)} (answer_confidence=${answer.answer_confidence.toFixed(4)}, ${gate})`,
        );
      } else {
        console.log(
          `  ${key} [noul]: P(true)=${answer.noul.toFixed(4)} (answer_confidence=${answer.answer_confidence.toFixed(4)}, ${gate})`,
        );
      }
    }
  }

  await laya.close();
}

main().catch((err) => {
  console.error("CLI failed:", err);
  process.exit(1);
});
