// Vercel AI SDK + Screwtape.ai: judge loop (pass / retry / fail) and an optional consensus step.
//   npm install
//   export OPENAI_API_KEY=... SCREWTAPE_API_KEY=...
//   npx tsx index.ts              # judge loop
//   npx tsx index.ts --consensus  # 3 samples -> consensus -> judge
import { openai } from "@ai-sdk/openai";
import { generateText } from "ai";
import { consensus, judge } from "./screwtape.js";

const TASK = "State the crew size and launch site of the mission.";
const EVIDENCE = ["The mission launched on 2024-03-01 from Cape Canaveral.", "The crew size was 4."];
const CRITERIA = ["crew size", "Cape Canaveral"];
const MAX_ATTEMPTS = 3;

async function ask(feedback?: string[]): Promise<string> {
  let prompt = `Task: ${TASK}\nEvidence:\n- ${EVIDENCE.join("\n- ")}`;
  if (feedback) prompt += `\nA reviewer rejected your last answer because:\n- ${feedback.join("\n- ")}`;
  const { text } = await generateText({
    model: openai("gpt-4o-mini"),
    system: "Answer only from the evidence you are given. Be brief.",
    prompt,
  });
  return text;
}

export async function judgedAnswer(): Promise<string | null> {
  let feedback: string[] | undefined;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const output = await ask(feedback);
    const v = await judge(TASK, output, EVIDENCE, CRITERIA);
    console.log(`attempt ${attempt}: ${v.verdict} score=${v.score} engine=${v.engine} id=${v.request_id} receipt=${v.receipt?.receipt_id ?? "-"}`);
    if (v.verdict === "pass") return output;
    if (v.verdict === "fail") return null; // wrong, not fixable: stop
    feedback = v.reasons; // retry with the reasons
  }
  return null;
}

export async function consensusThenJudge(n = 3): Promise<string | null> {
  const outputs = await Promise.all(Array.from({ length: n }, () => ask()));
  const c = await consensus(TASK, outputs.map((output, i) => ({ agent_id: `sample-${i}`, output })));
  console.log(`agreement=${c.agreement_score} risk=${c.false_consensus_risk}`);
  const v = await judge(TASK, c.consensus_answer, EVIDENCE, CRITERIA); // never trust the vote alone
  return v.verdict === "pass" ? c.consensus_answer : null;
}

const answer = process.argv.includes("--consensus") ? await consensusThenJudge() : await judgedAnswer();
console.log("ANSWER:", answer ?? "(rejected)");
