import test from 'node:test';
import assert from 'node:assert/strict';
import { action, createGame, needsTick, nextGame, tick, viewGame } from '../server/game.js';

const make = () => createGame([
  { id: 'a', name: 'Alice', color: '#a00' },
  { id: 'b', name: 'Bob', color: '#00a' },
], { seed: 'engine-transactions', turnSeconds: 30 });

test('nextGame isolates successful candidates and failed commands from the original', () => {
  const game = make();
  const before = structuredClone(game);
  const vertexId = viewGame(game, 'a').legal.settlements[0];
  const candidate = nextGame(game, 'a', 'placeSettlement', { vertexId });
  assert.deepEqual(game, before);
  assert.equal(candidate.phase, 'setupRoad');
  assert.equal(candidate.board.vertices.find(v => v.id === vertexId).building.owner, 'a');
  candidate.players[0].resources.wood = 99;
  candidate.board.vertices[0].hexIds.push('extra');
  assert.deepEqual(game, before);
  assert.throws(() => nextGame(game, 'b', 'placeSettlement', { vertexId }), /turn/);
  assert.deepEqual(game, before);
  assert.equal(action(game, 'a', 'placeSettlement', { vertexId }), game, 'legacy action keeps the same root identity');
  assert.equal(game.phase, 'setupRoad');
});

test('personalized views detach all nested data while preserving private information boundaries', () => {
  const game = make();
  game.players[0].development = [{ id: 'hidden-vp', type: 'victoryPoint', turnBought: 0 }];
  game.players[0].resources.ore = 4;
  game.players[0].score = 1;
  game.cardDeals = [{ id: 1, action: 'buyDevelopment', moves: [{ from: { kind: 'bank' }, to: { kind: 'player', id: 'a' }, kind: 'development', type: 'victoryPoint', cardId: 'hidden-vp', count: 1 }] }];
  game.tradeOffers = [{ id: 'offer', from: 'a', give: { ore: 1 }, want: { wheat: 1 }, declinedBy: [] }];
  const before = structuredClone(game);
  const own = viewGame(game, 'a');
  const opponent = viewGame(game, 'b');
  assert.equal(opponent.players[0].resources, null);
  assert.equal(opponent.players[0].development, null);
  assert.equal(opponent.players[0].score, 0);
  assert.equal(opponent.developmentDeck, undefined);
  assert.equal(opponent.playedDevelopment, undefined);
  assert.equal(opponent.cardDeals[0].moves[0].type, undefined);
  assert.equal(own.cardDeals[0].moves[0].type, 'victoryPoint');
  own.players[0].resources.ore = 100;
  own.players[0].development[0].type = 'knight';
  own.board.vertices[0].hexIds.push('extra');
  own.settings.seed = 'changed';
  own.cardDeals[0].moves[0].to.id = 'changed';
  own.tradeOffers[0].give.ore = 100;
  own.log[0].text = 'changed';
  assert.deepEqual(game, before);
  assert.equal(opponent.tradeOffers[0].give.ore, 1);
  game.phase = 'finished';
  assert.equal(viewGame(game, 'b').players[0].development[0].type, 'victoryPoint');
});

test('needsTick shares expiry and bot exclusion rules without mutating the game', () => {
  const game = make();
  const due = game.deadline;
  assert.equal(needsTick(game, due - 1), false);
  assert.equal(needsTick(game, due), true);
  assert.equal(needsTick(game, due, ['a']), false);
  game.phase = 'discard';
  game.discardRequired = { a: 1, b: 1 };
  assert.equal(needsTick(game, due, ['a']), true);
  assert.equal(needsTick(game, due, ['a', 'b']), false);
  const before = structuredClone(game);
  assert.equal(tick(game, due, ['a', 'b']), false);
  assert.deepEqual(game, before);
  game.phase = 'finished';
  assert.equal(needsTick(game, due), false);
  game.phase = 'action';
  game.deadline = null;
  assert.equal(needsTick(game, due), false);
});
