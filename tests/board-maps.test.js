import test from 'node:test';
import assert from 'node:assert/strict';
import { BOARD_MAPS } from '../shared/board-maps.js';
import { createGame, action, viewGame, RESOURCES } from '../server/game.js';
import { validateSettings } from '../server/index.js';
import { boardScenery } from '../src/board-layout.js';

const players = Array.from({ length: 6 }, (_, i) => ({ id: `p${i}`, name: `Player ${i}` }));

test('every map is connected, reproducible, and has valid production, coastline and separate ports', () => {
  for (const map of BOARD_MAPS) for (let seed = 0; seed < 20; seed++) {
    const settings = { map: map.id, seed: `map-${seed}`, lockDesertToCenter: seed % 2 === 0 };
    const g = createGame(players, settings), { board } = g;
    assert.deepEqual(board, createGame(players, settings).board);
    assert.equal(board.hexes.length, map.cells.length);
    assert.equal(board.hexes.find(h => h.id === g.robberHexId).terrain, 'desert');
    assert.equal(board.hexes.filter(h => h.terrain === 'desert').length, map.cells.length > 19 ? 2 : 1);
    const reached = new Set([board.hexes[0].id]);
    for (let i = 0; i < board.hexes.length; i++) for (const e of board.edges) {
      assert.ok(e.hexIds.length >= 1 && e.hexIds.length <= 2);
      if (e.hexIds.some(id => reached.has(id))) e.hexIds.forEach(id => reached.add(id));
      assert.ok(e.hexIds.filter(id => [6, 8].includes(board.hexes.find(h => h.id === id).number)).length <= 1);
    }
    assert.equal(reached.size, board.hexes.length);
    assert.equal(board.vertices.length - board.edges.length + board.hexes.length, 1, 'one island without holes');
    for (const h of board.hexes) {
      assert.equal(h.vertexIds.length, 6);
      if (h.terrain !== 'desert') assert.ok(h.number >= 2 && h.number <= 12 && h.number !== 7);
    }
    assert.equal(new Set(board.ports.flatMap(p => p.vertexIds)).size, board.ports.length * 2);
    for (const port of board.ports) assert.equal(board.edges.find(e => e.id === port.edgeId).hexIds.length, 1);
    const scenery = boardScenery(board);
    assert.match(scenery.shore, /^M.+Z$/);
    assert.equal(scenery.shore.includes('NaN'), false);
    assert.equal((scenery.shore.match(/Q/g) || []).length, board.edges.filter(e => e.hexIds.length === 1).length * 3);
  }
});

test('all maps support setup for two through six players with conserved resources', () => {
  for (const map of BOARD_MAPS) for (let count = 2; count <= 6; count++) {
    const g = createGame(players.slice(0, count), { map: map.id, seed: 'map-setup' });
    let moves = 0;
    while (g.phase.startsWith('setup')) {
      const legal = viewGame(g, g.activePlayerId).legal;
      if (g.phase === 'setupSettlement') action(g, g.activePlayerId, 'placeSettlement', { vertexId: legal.settlements[0] });
      else action(g, g.activePlayerId, 'placeRoad', { edgeId: legal.roads[0] });
      assert.ok(++moves <= count * 4);
    }
    assert.ok(g.players.every(p => p.score === 2));
    for (const r of RESOURCES) assert.equal(g.bank[r] + g.players.reduce((n, p) => n + p.resources[r], 0), count >= 5 || map.cells.length > 19 ? 24 : 19);
  }
});

test('map settings preserve shaped maps on player-limit changes and support old board settings', () => {
  assert.throws(() => validateSettings({ map: 'missing' }), /map/);
  assert.throws(() => createGame(players, { map: 'missing' }), /map/);
  assert.equal(validateSettings({ extendedBoard: true }).map, 'expanded');
  const narrows = validateSettings({ map: 'narrows', maxPlayers: 4 });
  assert.equal(validateSettings({ maxPlayers: 6 }, narrows).map, 'narrows');
  assert.equal(validateSettings({ extendedBoard: false }, narrows).map, 'classic');
  assert.equal(validateSettings({ map: 'narrows', extendedBoard: true }).extendedBoard, false);
});
