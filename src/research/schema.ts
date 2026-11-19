import { z } from "zod";

export const sourceSchema = z.object({
  id: z.string().min(1), url: z.url(), content: z.string().min(1),
  content_sha256: z.string().optional(), truncated_for_model: z.boolean().optional(),
});
export type Source = z.infer<typeof sourceSchema>;
const text = z.string().trim().min(1);
const taskSchema = z.object({
  name: text, action: text, object: text, outcome: text, process: text, scope_note: text,
  evidence: z.array(z.object({ source_id: text, quote: z.string().trim().min(15) })).min(1),
});
export function validateTasks(value: unknown, sources: Source[]) {
  const { tasks } = z.object({ tasks: z.array(taskSchema).min(1).max(8) }).parse(value);
  const normalize = (value: string) => value.replace(/\s+/g, " ").trim();
  const names = new Set<string>();
  for (const task of tasks) {
    const name = normalize(task.name).toLowerCase();
    if (names.has(name)) throw new Error(`Duplicate task: ${task.name}`);
    names.add(name);
    for (const evidence of task.evidence) {
      const source = sources.find((s) => s.id === evidence.source_id);
      if (!source || !normalize(source.content).includes(normalize(evidence.quote))) {
        throw new Error(`Quote not found in source ${evidence.source_id}`);
      }
    }
  }
  return tasks.map((task) => ({
    ...task, status: "supported" as const, cycle_time_seconds: null, labor_share: null,
  }));
}
export type Task = ReturnType<typeof validateTasks>[number];
