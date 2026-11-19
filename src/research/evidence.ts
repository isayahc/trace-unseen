/** Compare visible text; ignore Markdown emphasis, never words or numbers. */
export function normalizeEvidence(text: string): string {
  return text.replace(/\*\*([^*]+)\*\*/g, "$1").replace(/__([^_]+)__/g, "$1").replace(/\s+/g, " ").trim();
}
