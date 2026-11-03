// Small Screwtape.ai client (fetch only). Reads SCREWTAPE_API_KEY from the environment.
// Without a key, judge and consensus answer HTTP 402; get a free key at https://screwtape.ai/signup/.
// Fields follow https://screwtape.ai/openapi.json.
const API = "https://screwtape.ai";

export type Receipt = {
  receipt_id: string;
  issued_at: string;
  endpoint: "/v1/judge" | "/v1/consensus";
  request_sha256: string;
  verdict: string;
  score: number;
  payment: { type: string; key_prefix?: string };
  alg: "Ed25519";
  kid: string;
  signature: string;
};

export type Retention = { retained: boolean; id?: string; expires_at?: string; reason?: string };

export type Verdict = {
  verdict: "pass" | "fail" | "retry";
  score: number;
  reasons: string[];
  engine: "deterministic" | "llm" | "demo";
  request_id: string;
  retention: Retention;
  receipt?: Receipt; // present when signing is configured on the server
};

export type Consensus = {
  consensus_answer: string;
  agreement_score: number;
  false_consensus_risk: "low" | "medium" | "high";
  reasons: string[];
  clusters: { size: number; agent_ids: string[]; representative: string }[];
  engine: "deterministic" | "llm" | "demo";
  request_id: string;
  retention: Retention;
  receipt?: Receipt;
};

async function post<T>(path: string, body: unknown, auth = true): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const key = process.env.SCREWTAPE_API_KEY;
  if (auth && key) headers.Authorization = `Bearer ${key}`;
  const res = await fetch(API + path, { method: "POST", headers, body: JSON.stringify(body) });
  if (res.status === 402) {
    throw new Error(
      "402 Payment Required: set SCREWTAPE_API_KEY. Get a free key (10 calls per UTC day) at https://screwtape.ai/signup/ or with get-free-key.ts.",
    );
  }
  if (!res.ok) throw new Error(`Screwtape ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return (await res.json()) as T;
}

export const judge = (task: string, agent_output: string, evidence?: string[], criteria?: string[]) =>
  post<Verdict>("/v1/judge", { task, agent_output, ...(evidence && { evidence }), ...(criteria && { criteria }) });

export const consensus = (task: string, answers: { agent_id?: string; output: string }[]) =>
  post<Consensus>("/v1/consensus", { task, answers });

// Free, no key needed, and the receipt is not stored.
export const verifyReceipt = async (receipt: Receipt) =>
  (await post<{ valid: boolean }>("/v1/receipts/verify", receipt, false)).valid;
