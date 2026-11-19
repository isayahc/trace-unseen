import { jsonrepair } from "jsonrepair";

/** Repairs JSON syntax only; callers must still validate schemas, references and evidence. */
export function parseOutput(answer: string): { value: unknown; repaired: boolean } {
  const text = answer.trim().replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
  try { return { value: JSON.parse(text), repaired: false }; }
  catch { return { value: JSON.parse(jsonrepair(text)), repaired: true }; }
}
