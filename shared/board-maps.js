const roundIsland = rows => rows.flatMap((length, row) => Array.from({ length }, (_, col) => ({
  x: (col - (length - 1) / 2) * Math.sqrt(3) * 60,
  y: (row - (rows.length - 1) / 2) * 90,
})));

// Axial coordinates keep every neighboring tile on the same hexagonal grid.
const axialRows = rows => rows.flatMap(([r, columns]) => columns.map(q => ({
  x: (q + r / 2) * Math.sqrt(3) * 60, y: r * 90,
})));

export const BOARD_MAPS = [
  { id: 'classic', name: 'Classic', description: 'The original island.', cells: roundIsland([3, 4, 5, 4, 3]) },
  { id: 'expanded', name: 'Expanded', description: 'A larger island with more room to build.', cells: roundIsland([3, 4, 5, 6, 5, 4, 3]) },
  { id: 'narrows', name: 'The Narrows', description: 'Two broad halves joined by a narrow land crossing.', cells: axialRows([
    [-2, [-1, 3]],
    [-1, [-2, -1, 2, 3]],
    [0, [-3, -2, -1, 0, 1, 2, 3]],
    [1, [-3, -2, 1, 2]],
    [2, [-3, 1]],
  ]) },
  { id: 'sweden', name: 'Sweden', description: '30 hexes along a connected Swedish mainland, from the northern highlands to the southern coast.', cells: axialRows([
    [-6, [2, 3]],
    [-5, [2, 3, 4]],
    [-4, [1, 2, 3]],
    [-3, [0, 1, 2]],
    [-2, [0, 1]],
    [-1, [-1, 0]],
    [0, [-2, -1]],
    [1, [-3, -2]],
    [2, [-3, -2]],
    [3, [-4, -3, -2]],
    [4, [-5, -4, -3]],
    [5, [-5, -4]],
    [6, [-6]],
  ]) },
];

export function boardMap(settings = {}) {
  const id = settings.map ?? (settings.extendedBoard ? 'expanded' : 'classic');
  const map = BOARD_MAPS.find(map => map.id === id);
  if (!map) throw Error('Choose a valid board map.');
  return map;
}

export function centerCellIndex(cells) {
  const x = (Math.min(...cells.map(c => c.x)) + Math.max(...cells.map(c => c.x))) / 2;
  const y = (Math.min(...cells.map(c => c.y)) + Math.max(...cells.map(c => c.y))) / 2;
  return cells.reduce((best, cell, i) => Math.hypot(cell.x - x, cell.y - y) < Math.hypot(cells[best].x - x, cells[best].y - y) ? i : best, 0);
}
