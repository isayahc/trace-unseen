export function assertDag(ids: string[], edges: { source: string; target: string }[]) {
  const indegree = new Map(ids.map((id) => [id, 0]));
  const next = new Map(ids.map((id) => [id, [] as string[]]));
  for (const edge of edges) {
    if (!indegree.has(edge.source) || !indegree.has(edge.target)) throw new Error("Unknown process dependency");
    if (edge.source === edge.target) throw new Error("Process self-dependency is not allowed");
    indegree.set(edge.target, indegree.get(edge.target)! + 1);
    next.get(edge.source)!.push(edge.target);
  }
  const queue = ids.filter((id) => indegree.get(id) === 0);
  let visited = 0;
  for (let i = 0; i < queue.length; i++) {
    visited++;
    for (const target of next.get(queue[i])!) {
      indegree.set(target, indegree.get(target)! - 1);
      if (indegree.get(target) === 0) queue.push(target);
    }
  }
  if (visited !== ids.length) throw new Error("Process dependencies contain a cycle");
}
