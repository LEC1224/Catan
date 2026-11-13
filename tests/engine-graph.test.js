import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, nextGame, viewGame } from '../server/game.js';

const players = ['a', 'b', 'c'].map(id => ({ id, name: id, color: '#123456' }));

// Deliberately exhaustive oracle: remove each traversed edge and try every
// remaining continuation. It also permits revisiting vertices (closed loops).
function referenceRoute(board, owner) {
  const roads = board.edges.filter(e => e.owner === owner);
  const blocked = new Set(board.vertices.filter(v => v.building && v.building.owner !== owner).map(v => v.id));
  function extend(at, remaining) {
    if (blocked.has(at)) return 0;
    let best = 0;
    for (const road of remaining) if (road.a === at || road.b === at) {
      best = Math.max(best, 1 + extend(road.a === at ? road.b : road.a, remaining.filter(e => e !== road)));
    }
    return best;
  }
  return Math.max(0, ...roads.flatMap(road => [road.a, road.b].map(at => 1 + extend(at, roads.filter(e => e !== road)))));
}

test('route scoring agrees with exhaustive trails across 180 positions, loops and blocking buildings', () => {
  let state = 7;
  const random = n => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state % n; };
  for (const map of ['classic', 'expanded', 'narrows', 'sweden']) {
    const base = createGame(players, { map, seed: 'route-oracle', victoryPoints: 20 });
    for (let sample = 0; sample < 45; sample++) {
      const game = structuredClone(base);
      for (const { id } of players) {
        const first = game.board.edges.filter(e => !e.owner)[random(game.board.edges.filter(e => !e.owner).length)];
        const reached = new Set([first.a, first.b]);
        first.owner = id;
        const length = 1 + random(15);
        for (let count = 1; count < length; count++) {
          const frontier = game.board.edges.filter(e => !e.owner && (reached.has(e.a) || reached.has(e.b)));
          if (!frontier.length) break;
          const road = frontier[random(frontier.length)];
          road.owner = id;
          reached.add(road.a); reached.add(road.b);
        }
      }
      for (let n = 0; n < 6; n++) {
        game.board.vertices[random(game.board.vertices.length)].building = { owner: players[random(players.length)].id, type: random(2) ? 'settlement' : 'city' };
      }
      game.phase = 'action';
      game.tradeOffers = [{ id: 'refresh', from: 'a', declinedBy: [] }];
      const updated = nextGame(game, 'a', 'cancelTrade', { offerId: 'refresh' });
      for (const p of updated.players) {
        assert.equal(p.longestRoad, referenceRoute(game.board, p.id), `${map}, sample ${sample}, player ${p.id}`);
        assert.equal(p.roadsLeft, 15 - game.board.edges.filter(e => e.owner === p.id).length);
        assert.equal(p.citiesLeft, 4 - game.board.vertices.filter(v => v.building?.owner === p.id && v.building.type === 'city').length);
        assert.equal(p.settlementsLeft, 5 - game.board.vertices.filter(v => v.building?.owner === p.id && v.building.type === 'settlement').length);
      }
    }
  }
});

test('board lookups remain correct after a saved board is reordered', () => {
  let ordered = createGame(players, { seed: 'reordered-graph' });
  let reordered = JSON.parse(JSON.stringify(ordered));
  reordered.board.vertices.reverse();
  reordered.board.edges.reverse();
  reordered.board.hexes.reverse();
  while (ordered.phase.startsWith('setup')) {
    const playerId = ordered.activePlayerId;
    const legal = viewGame(ordered, playerId).legal;
    const otherLegal = viewGame(reordered, playerId).legal;
    for (const key of Object.keys(legal)) assert.deepEqual([...legal[key]].sort(), [...otherLegal[key]].sort());
    const settlement = ordered.phase === 'setupSettlement';
    const type = settlement ? 'placeSettlement' : 'placeRoad';
    const payload = settlement ? { vertexId: legal.settlements[0] } : { edgeId: legal.roads[0] };
    ordered = nextGame(ordered, playerId, type, payload);
    reordered = nextGame(reordered, playerId, type, payload);
    assert.deepEqual(ordered.players, reordered.players);
  }
  ordered.phase = 'action';
  for (const id of [undefined, null, 0, {}, '__proto__', 'v99999']) {
    assert.throws(() => nextGame(ordered, ordered.activePlayerId, 'upgradeCity', { vertexId: id }), /settlements/);
  }
});
