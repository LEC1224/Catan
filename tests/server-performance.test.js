import test from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { createAppServer } from '../server/index.js';
import { call, connect, eventually } from './helpers/socket-client.js';

async function startMatch(t, withBot = false) {
  const server = await createAppServer({ port: 0, testMode: true, persistence: false });
  const clients = [];
  t.after(async () => { clients.forEach(client => client.disconnect()); await server.close(); });
  const host = await connect(server.port); clients.push(host);
  assert.equal((await call(host, 'createLobby', { playerName: 'Host', settings: { turnSeconds: 0 } })).ok, true);
  if (withBot) assert.equal((await call(host, 'addBot')).ok, true);
  else {
    const guest = await connect(server.port); clients.push(guest);
    assert.equal((await call(guest, 'joinLobby', { id: host.lobby.id, playerName: 'Guest' })).ok, true);
    assert.equal((await call(guest, 'setReady', { ready: true })).ok, true);
  }
  assert.equal((await call(host, 'startGame')).ok, true);
  return { server, clients, host, lobby: server.lobbies.get(host.lobby.id) };
}

function countGameCopies(t) {
  const clone = globalThis.structuredClone;
  let copies = 0;
  t.mock.method(globalThis, 'structuredClone', (value, options) => {
    if (Array.isArray(value?.developmentDeck)) copies++;
    return clone(value, options);
  });
  return () => copies;
}

test('server timer polls copy no game until a human decision is due', async t => {
  const { host, lobby } = await startMatch(t, true);
  const copies = countGameCopies(t);
  await delay(125); // At least two server timer polls.
  assert.equal(copies(), 0, 'unlimited thinking time does not copy the game');

  lobby.game.deadline = Date.now() + 30000;
  await delay(125);
  assert.equal(copies(), 0, 'a future deadline does not copy the game');

  lobby.game.activePlayerId = lobby.players.find(player => player.isBot).id;
  lobby.game.deadline = Date.now() - 1;
  await delay(125);
  assert.equal(copies(), 0, 'an expired browser-controlled bot decision does not copy the game');
  assert.equal(lobby.game.phase, 'setupSettlement');

  lobby.game.activePlayerId = host.playerId;
  await eventually(() => lobby.game.phase === 'setupRoad', 'expired human placement is still resolved');
  assert.equal(copies(), 2, 'timeout uses an outer transaction and one atomic engine action');
  assert.equal(lobby.recording.frames.length, 2, 'automatic action is still recorded');
});

test('server commands use one game copy and keep failed moves atomic', async t => {
  const { clients, lobby } = await startMatch(t);
  const active = clients.find(client => client.playerId === lobby.game.activePlayerId);
  await call(active, 'getDirectory');
  const before = lobby.game, original = structuredClone(before);
  const copies = countGameCopies(t);
  const vertexId = active.lobby.game.legal.settlements[0];
  assert.equal((await call(active, 'gameAction', { type: 'placeSettlement', vertexId })).ok, true);
  assert.equal(copies(), 1, 'command does not clone before asking the engine for a candidate');
  assert.deepEqual(before, original, 'previous state remains isolated from committed state');
  assert.equal(lobby.game.phase, 'setupRoad');
  assert.equal(lobby.recording.frames.length, 2);
  assert.equal(lobby.botRevision, 1);

  const accepted = lobby.game;
  const rejected = await call(active, 'gameAction', { type: 'placeRoad', edgeId: 'missing' });
  assert.equal(rejected.ok, false);
  assert.equal(lobby.game, accepted, 'failed move never replaces the state');
  assert.equal(lobby.recording.frames.length, 2);
  assert.equal(lobby.botRevision, 1);
});

test('tabs share only their own personalized view and one bot controller lease', async t => {
  const { server, clients, host, lobby } = await startMatch(t, true);
  const tab = await connect(server.port, host.token); clients.push(tab);
  await call(host, 'getDirectory');
  assert.deepEqual(tab.lobby.game, host.lobby.game);
  assert.equal(tab.lobby.meId, host.playerId);
  assert.ok(host.botState, 'first host tab controls bots');
  assert.equal(tab.botState, null, 'other tabs receive no private bot observations');
  for (const player of tab.lobby.game.players) {
    assert.equal(player.resources === null, player.id !== host.playerId);
  }
  host.disconnect();
  await eventually(() => !!tab.botState, 'remaining host tab takes over bot control');
  assert.equal(tab.botState.matchId, lobby.matchId);
});
