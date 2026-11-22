// Undirected graph: Map<locationId, [{ to, distance, instruction }]>.
// Each direction carries its own instruction.
function buildGraph(edges, { accessibleOnly = false } = {}) {
  const graph = new Map();
  const add = (a, b, distance, instruction) => {
    if (!graph.has(a)) graph.set(a, []);
    graph.get(a).push({ to: b, distance, instruction });
  };
  for (const e of edges) {
    if (accessibleOnly && !e.accessible) continue;
    add(e.from_location_id, e.to_location_id, e.distance_m, e.instruction);
    add(e.to_location_id, e.from_location_id, e.distance_m, e.reverse_instruction);
  }
  return graph;
}

// Dijkstra. shortcut: linear-scan priority queue, fine for hundreds of nodes, use a heap beyond that.
function shortestPath(graph, fromId, toId) {
  if (fromId === toId) return { locationIds: [fromId], totalDistance: 0, steps: [] };
  const dist = new Map([[fromId, 0]]);
  const prev = new Map();
  const done = new Set();
  for (;;) {
    let cur = null;
    for (const [id, d] of dist) if (!done.has(id) && (cur === null || d < dist.get(cur))) cur = id;
    if (cur === null) return null;
    if (cur === toId) break;
    done.add(cur);
    for (const e of graph.get(cur) || []) {
      const nd = dist.get(cur) + e.distance;
      if (!dist.has(e.to) || nd < dist.get(e.to)) {
        dist.set(e.to, nd);
        prev.set(e.to, { from: cur, instruction: e.instruction, distance: e.distance });
      }
    }
  }
  const steps = [];
  const locationIds = [toId];
  for (let id = toId; id !== fromId;) {
    const p = prev.get(id);
    steps.unshift({ fromId: p.from, toId: id, instruction: p.instruction, distance: p.distance });
    locationIds.unshift(p.from);
    id = p.from;
  }
  return { locationIds, totalDistance: dist.get(toId), steps };
}

module.exports = { buildGraph, shortestPath };
