import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { syncBuiltinESMExports } from 'node:module';
import { action, createGame, tick, viewGame } from '../server/game.js';

const player = id => ({ kind: 'player', id });
const tile = id => ({ kind: 'tile', id });
const bank = { kind: 'bank' };
const resource = (from, to, type, count) => ({ from, to, kind: 'resource', type, count });
const game = () => createGame(['a', 'b', 'c'].map(id => ({ id, name: id, color: '#855' })), { seed: 'card-deals' });

function rollSix(t, run) {
  const dice = t.mock.method(crypto, 'randomInt', () => 3);
  syncBuiltinESMExports();
  try { run(); }
  finally { dice.mock.restore(); syncBuiltinESMExports(); }
}

function productionGame() {
  const g = game();
  const [city, settlement, secondCity, blocked, shortA, shortB] = g.board.vertices;
  const producers = [
    ['forest', 'wood', city, 'a', 'city'],
    ['pasture', 'wool', settlement, 'b', 'settlement'],
    ['second-forest', 'wood', secondCity, 'a', 'city'],
    ['robber', 'ore', blocked, 'a', 'city'],
    ['clay-a', 'brick', shortA, 'a', 'settlement'],
    ['clay-b', 'brick', shortB, 'b', 'settlement'],
  ];
  g.board.hexes = producers.map(([id, terrain, v, owner, type]) => {
    v.building = { owner, type };
    return { id, number: 6, terrain, vertexIds: [v.id] };
  });
  g.robberHexId = 'robber';
  g.bank.wood = 3;
  g.bank.brick = 1;
  g.phase = 'roll';
  return g;
}

test('production records the paid tiles and quantities, even when a timeout clears the dice', t => {
  const g = productionGame();
  rollSix(t, () => assert.equal(tick(g, g.deadline), true));
  assert.equal(g.dice, null);
  assert.equal(g.players[0].resources.wood, 3);
  assert.equal(g.players[0].resources.ore, 0);
  assert.equal(g.players[1].resources.wool, 1);
  assert.equal(g.bank.brick, 1);
  assert.deepEqual(viewGame(g, 'c').cardDeals, [{ id: 1, action: 'rollDice', moves: [
    resource(tile('forest'), player('a'), 'wood', 2),
    resource(tile('second-forest'), player('a'), 'wood', 1),
    resource(tile('pasture'), player('b'), 'wool', 1),
  ] }]);
});

test('offers and failed exchanges create no flights; completed exchanges record both directions', () => {
  const g = game();
  g.phase = 'action';
  const [a, b] = g.players;
  a.resources.wood = 8;
  a.resources.wheat = 1;
  b.resources.ore = 1;
  assert.throws(() => action(g, a.id, 'bankTrade', { give: 'wood', receive: 'wool', amount: 3 }));
  action(g, a.id, 'offerTrade', { give: { wood: 2, wheat: 1 }, want: { ore: 1 } });
  assert.deepEqual(viewGame(g, b.id).cardDeals, []);
  action(g, b.id, 'acceptTrade');
  action(g, a.id, 'bankTrade', { give: 'wood', receive: 'wool' });
  const [trade, exchange] = viewGame(g, a.id).cardDeals;
  assert.equal(trade.action, 'acceptTrade');
  assert.deepEqual(trade.moves, [
    resource(player(a.id), player(b.id), 'wood', 2), resource(player(a.id), player(b.id), 'wheat', 1),
    resource(player(b.id), player(a.id), 'ore', 1),
  ]);
  assert.deepEqual(viewGame(g, b.id).cardDeals[0], trade);
  assert.deepEqual(viewGame(g, 'c').cardDeals[0].moves, [
    { from: player(a.id), to: player(b.id), kind: 'resource', count: 3 },
    { from: player(b.id), to: player(a.id), kind: 'resource', count: 1 },
  ]);
  assert.deepEqual(exchange, { id: trade.id + 1, action: 'bankTrade', moves: [
    resource(player(a.id), bank, 'wood', 4), resource(bank, player(a.id), 'wool', 1),
  ] });
});

test('only the buyer sees the face of a development card and deal history stays bounded', () => {
  const g = game();
  g.phase = 'action';
  for (let i = 0; i < 13; i++) {
    const a = g.players[0];
    Object.assign(a.resources, { wool: 1, wheat: 1, ore: 1 });
    action(g, a.id, 'buyDevelopment');
  }
  const own = viewGame(g, 'a'), other = viewGame(g, 'b');
  assert.equal(own.cardDeals.at(-1).id, 13);
  assert.equal(own.cardDeals[0].id, 2);
  const card = own.players[0].development.at(-1);
  assert.deepEqual(own.cardDeals.at(-1).moves, [
    { from: bank, to: player('a'), kind: 'development', count: 1, type: card.type, cardId: card.id },
  ]);
  assert.deepEqual(other.cardDeals.at(-1).moves, [
    { from: bank, to: player('a'), kind: 'development', count: 1 },
  ]);
  assert.equal(other.players[0].development, null);
});
