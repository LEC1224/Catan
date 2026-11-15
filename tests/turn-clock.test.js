import test from 'node:test';
import assert from 'node:assert/strict';
import { action, createGame, tick, viewGame } from '../server/game.js';
import { createAppServer } from '../server/index.js';
import { call, connect } from './helpers/socket-client.js';

function actionPhase(turnSeconds = 30) {
  const game = createGame([{ id: 'a', name: 'Alice' }, { id: 'b', name: 'Bob' }], { seed: 'turn-clock', turnSeconds });
  game.phase = 'action';
  game.turn = 1;
  game.board.vertices[0].building = { owner: 'a', type: 'settlement' };
  return game;
}

function giveResources(game, id, resources) {
  const hand = game.players.find(player => player.id === id).resources;
  for (const [resource, count] of Object.entries(resources)) {
    hand[resource] += count;
    game.bank[resource] -= count;
  }
}

function buildRoad(game) {
  const [edgeId] = viewGame(game, 'a').legal.roads;
  action(game, 'a', 'placeRoad', { edgeId });
}

test('a build moves the original expiry; a bank trade can refill only up to the configured time', t => {
  let now = Date.now();
  t.mock.method(Date, 'now', () => now);
  const game = actionPhase(), originalDeadline = game.deadline;
  giveResources(game, 'a', { wood: 5, brick: 1 });
  now += 15_000;

  assert.throws(() => action(game, 'a', 'placeRoad', { edgeId: 'invalid' }), /not legal/);
  assert.equal(game.deadline, originalDeadline);
  buildRoad(game);
  assert.equal(game.deadline, originalDeadline + 10_000);
  assert.equal(tick(game, originalDeadline), false);

  action(game, 'a', 'bankTrade', { give: 'wood', receive: 'ore' });
  assert.equal(game.deadline, now + 30_000);
  now = game.deadline;
  assert.equal(tick(game, now), true);
  assert.equal(game.activePlayerId, 'b');
  assert.equal(game.deadline, now + 30_000);
});

test('Road Building played during the action phase adds time for the card and each free road', t => {
  let now = Date.now();
  t.mock.method(Date, 'now', () => now);
  const game = actionPhase(), originalDeadline = game.deadline;
  game.players[0].development.push({ id: 'roads', type: 'roadBuilding', turnBought: 0 });
  now += 25_000;

  action(game, 'a', 'playDevelopment', { cardId: 'roads' });
  assert.equal(game.deadline, originalDeadline + 10_000);
  now += 8_000;
  buildRoad(game);
  assert.equal(game.deadline, originalDeadline + 20_000);
  now += 8_000;
  buildRoad(game);
  assert.equal(game.roadBuildingRemaining, 0);
  assert.equal(game.deadline, originalDeadline + 30_000);
});

test('a successful build does not start a disabled clock or revive an expired one', t => {
  let now = Date.now();
  t.mock.method(Date, 'now', () => now);
  for (const turnSeconds of [0, 30]) {
    const game = actionPhase(turnSeconds), deadline = game.deadline;
    giveResources(game, 'a', { wood: 1, brick: 1 });
    if (deadline !== null) now = deadline;

    buildRoad(game);
    assert.equal(game.deadline, deadline);
  }
});

test('both players see the active turn gain time when a player trade completes', async t => {
  const server = await createAppServer({ port: 0, testMode: true, persistence: false });
  const clients = [];
  t.after(async () => { clients.forEach(client => client.disconnect()); await server.close(); });
  clients.push(await connect(server.port));
  clients.push(await connect(server.port));
  const [host, guest] = clients;
  const { ok, id } = await call(host, 'createLobby', { playerName: 'Ada', settings: { turnSeconds: 30 } });
  assert.equal(ok, true);
  assert.equal((await call(guest, 'joinLobby', { id, playerName: 'Birch' })).ok, true);
  assert.equal((await call(guest, 'setReady', { ready: true })).ok, true);
  assert.equal((await call(host, 'startGame')).ok, true);

  const game = server.lobbies.get(id).game;
  const sender = clients.find(client => client.playerId === game.activePlayerId);
  const recipient = clients.find(client => client !== sender);
  const originalDeadline = Date.now() + 15_000;
  game.phase = 'action';
  game.turn = 1;
  game.deadline = originalDeadline;
  giveResources(game, sender.playerId, { wood: 1 });
  giveResources(game, recipient.playerId, { ore: 1 });
  const send = async (client, type, payload) => {
    const result = await call(client, 'gameAction', { type, ...payload });
    assert.equal(result.ok, true, result.error);
  };
  const offer = async () => {
    await send(sender, 'offerTrade', { give: { wood: 1 }, want: { ore: 1 } });
    assert.equal(sender.lobby.game.deadline, originalDeadline);
    return sender.lobby.game.tradeOffers[0].id;
  };

  await send(recipient, 'declineTrade', { offerId: await offer() });
  assert.equal(recipient.lobby.game.deadline, originalDeadline);
  await send(sender, 'cancelTrade', { offerId: await offer() });
  assert.equal(sender.lobby.game.deadline, originalDeadline);

  const offerId = await offer();
  await send(recipient, 'acceptTrade', { offerId });
  await call(sender, 'getDirectory');
  assert.equal(sender.lobby.game.deadline, originalDeadline);
  await send(sender, 'confirmTrade', { offerId, recipientId: recipient.playerId });
  await call(recipient, 'getDirectory');
  for (const client of clients) {
    assert.equal(client.lobby.game.activePlayerId, sender.playerId);
    assert.equal(client.lobby.game.deadline, originalDeadline + 10_000);
  }
  assert.equal(sender.lobby.game.players.find(p => p.id === sender.playerId).resources.ore, 1);
  assert.equal(recipient.lobby.game.players.find(p => p.id === recipient.playerId).resources.wood, 1);
});
