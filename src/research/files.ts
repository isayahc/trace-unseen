import { writeFile } from "node:fs/promises";

export async function saveJson(path: string, value: unknown) {
  await writeFile(path, JSON.stringify(value, null, 2), "utf8");
}
