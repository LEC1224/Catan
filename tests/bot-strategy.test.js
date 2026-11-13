import test from 'node:test';
import assert from 'node:assert/strict';
import { action, createGame, viewGame } from '../server/game.js';
import { chooseBotAction } from '../src/bots/strategy.js';

function cityOpportunity(resources, settings = {}) {
  const game = createGame([{ id: 'bot' }, { id: 'other' }], { seed: 'bot-tactics', allowPlayerTrading: false, ...settings });
  game.phase = 'action'; game.turn = 1;
  const vertex = game.board.vertices.find(vertex => vertex.hexIds.length === 3);
  vertex.building = { type: 'settlement', owner: 'bot' };
  const player = game.players[0];
  player.settlementsLeft--; player.score = player.visibleScore = 1;
  Object.assign(player.resources, resources);
  for (const [resource, count] of Object.entries(resources)) game.bank[resource] -= count;
  return { game, player, vertex };
}

const decide = (game, memory = {}, difficulty = 'hard') => chooseBotAction(viewGame(game, 'bot'), 'bot', difficulty, memory, () => 0.5);
const apply = (game, chosen) => action(game, 'bot', chosen.type, chosen);

test('bots trade toward a city before spending its ingredients on an affordable development card', () => {
  for (const difficulty of ['easy', 'normal', 'hard']) {
    const { game, vertex } = cityOpportunity({ wood: 4, wool: 1, wheat: 1, ore: 3 });
    const memory = {};
    const trade = decide(game, memory, difficulty);
    assert.deepEqual(trade, { type: 'bankTrade', give: 'wood', receive: 'wheat', amount: 1 });
    apply(game, trade);
    const build = decide(game, memory, difficulty);
    assert.deepEqual(build, { type: 'upgradeCity', vertexId: vertex.id });
    apply(game, build);
    assert.equal(game.board.vertices.find(v => v.id === vertex.id).building.type, 'city');
  }
});

test('bots finish a multi-exchange city plan when a lesser purchase becomes affordable midway', () => {
  const { game, vertex } = cityOpportunity({ wood: 8, wool: 1, ore: 3 });
  const memory = {};
  for (let step = 0; step < 2; step++) {
    const trade = decide(game, memory);
    assert.deepEqual(trade, { type: 'bankTrade', give: 'wood', receive: 'wheat', amount: 1 });
    apply(game, trade);
  }
  assert.deepEqual(decide(game, memory), { type: 'upgradeCity', vertexId: vertex.id });
});

test('bots abandon an exchange goal if the bank can no longer complete it', () => {
  const { game } = cityOpportunity({ wood: 8, wool: 1, ore: 3 });
  const memory = {};
  apply(game, decide(game, memory));
  game.bank.wheat = 0;
  assert.deepEqual(decide(game, memory), { type: 'buyDevelopment' });
});

test('bots take an immediate winning build before playing a development card', () => {
  const { game, player, vertex } = cityOpportunity({ wheat: 2, ore: 3 }, { victoryPoints: 3 });
  const second = game.board.vertices.find(v => v.id !== vertex.id && !vertex.neighborIds.includes(v.id));
  second.building = { type: 'settlement', owner: 'bot' };
  player.score = player.visibleScore = 2;
  player.development = [{ id: 'saved-invention', type: 'invention', turnBought: 0 }];
  const chosen = decide(game);
  assert.equal(chosen.type, 'upgradeCity');
  apply(game, chosen);
  assert.equal(game.winnerId, 'bot');
  assert.equal(game.players[0].development[0].id, 'saved-invention');
});

test('Invention completes a stronger build even when a development purchase is already affordable', () => {
  const { game, player } = cityOpportunity({ wool: 1, wheat: 1, ore: 2 });
  player.development = [{ id: 'invention', type: 'invention', turnBought: 0 }];
  assert.deepEqual(decide(game), {
    type: 'playDevelopment', cardId: 'invention', resources: { wood: 0, brick: 0, wool: 0, wheat: 1, ore: 1 },
  });
});

function roadView(connections, legalRoads, buildings = {}) {
  const edges = connections.map(([a, b, owner]) => ({ id: `${a}-${b}`, a, b, owner }));
  const vertices = [...new Set(connections.flatMap(([a, b]) => [a, b]))].map(id => ({
    id, hexIds: [], building: buildings[id],
    edgeIds: edges.filter(e => e.a === id || e.b === id).map(e => e.id),
    neighborIds: edges.filter(e => e.a === id || e.b === id).map(e => e.a === id ? e.b : e.a),
  }));
  return {
    board: { vertices, edges, hexes: [] }, phase: 'setupRoad', activePlayerId: 'bot', turn: 0,
    players: [{ id: 'bot', resources: { wood: 0, brick: 0, wool: 0, wheat: 0, ore: 0 }, longestRoad: 0 }, { id: 'other', longestRoad: 0 }],
    legal: { roads: legalRoads }, settings: { mode: 'individual' },
  };
}

test('road planning does not expand through an opponent settlement', () => {
  const game = roadView([
    ['start', 'blocked'], ['blocked', 'opponent'], ['opponent', 'beyond'], ['beyond', 'unreachable'],
    ['start', 'open'], ['open', 'reachable'],
  ], ['start-blocked', 'start-open'], {
    start: { owner: 'bot', type: 'settlement' }, opponent: { owner: 'other', type: 'settlement' },
  });
  assert.deepEqual(chooseBotAction(game, 'bot', 'hard', {}, () => 0.5), { type: 'placeRoad', edgeId: 'start-open' });
});

test('road planning prefers reaching a new site over connecting an already reached loop', () => {
  const game = roadView([
    ['start', 'a', 'bot'], ['a', 'b', 'bot'], ['b', 'c', 'bot'], ['c', 'start'],
    ['a', 'frontier'], ['frontier', 'site'],
  ], ['c-start', 'a-frontier'], { start: { owner: 'bot', type: 'settlement' } });
  assert.deepEqual(chooseBotAction(game, 'bot', 'hard', {}, () => 0.5), { type: 'placeRoad', edgeId: 'a-frontier' });
});
