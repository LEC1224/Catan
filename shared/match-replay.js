// The terrain, numbers and harbors never change. Layer the selected move's
// pieces on that geometry rather than transmitting a second board on every seek.
export function replayBoard(board, position) {
  const buildings = new Map(position.buildings.map(([id, owner, type]) => [id, { owner, type }]));
  const roads = new Map(position.roads);
  return {
    ...board,
    vertices: board.vertices.map(v => ({ ...v, building: buildings.get(v.id) ?? null })),
    edges: board.edges.map(e => ({ ...e, owner: roads.get(e.id) ?? null })),
  };
}
