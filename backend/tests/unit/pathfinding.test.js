const { buildGraph, shortestPath } = require('../../utils/pathfinding');

const e = (from, to, d, accessible = 1) => ({
  from_location_id: from, to_location_id: to, distance_m: d, accessible,
  instruction: `go ${from}->${to}`, reverse_instruction: `back ${to}->${from}`,
});

describe('pathfinding', () => {
  it('prefers the shorter path over fewer hops', () => {
    const g = buildGraph([e(1, 2, 100), e(1, 3, 10), e(3, 4, 10), e(4, 2, 10)]);
    const p = shortestPath(g, 1, 2);
    expect(p.locationIds).toEqual([1, 3, 4, 2]);
    expect(p.totalDistance).toBe(30);
    expect(p.steps).toHaveLength(3);
  });

  it('accessibleOnly avoids inaccessible edges', () => {
    const edges = [e(1, 2, 10, 0), e(1, 3, 20), e(3, 2, 20)];
    expect(shortestPath(buildGraph(edges), 1, 2).totalDistance).toBe(10);
    expect(shortestPath(buildGraph(edges, { accessibleOnly: true }), 1, 2).locationIds).toEqual([1, 3, 2]);
  });

  it('returns null when unreachable', () => {
    expect(shortestPath(buildGraph([e(1, 2, 5), e(3, 4, 5)]), 1, 4)).toBeNull();
    expect(shortestPath(buildGraph([e(1, 2, 5, 0)], { accessibleOnly: true }), 1, 2)).toBeNull();
  });

  it('same node gives a zero-step path', () => {
    expect(shortestPath(buildGraph([e(1, 2, 5)]), 1, 1)).toEqual({ locationIds: [1], totalDistance: 0, steps: [] });
  });

  it('uses the reverse instruction when walking backward', () => {
    const p = shortestPath(buildGraph([e(1, 2, 5)]), 2, 1);
    expect(p.steps).toEqual([{ fromId: 2, toId: 1, instruction: 'back 2->1', distance: 5 }]);
  });
});
