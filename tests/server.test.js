import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { io } from 'socket.io-client';
import { createAppServer, validateSettings } from '../server/index.js';

const call = (client, event, payload = {}) => new Promise((resolve, reject) => client.timeout(3000).emit(event, payload, (error, result) => error ? reject(error) : resolve(result)));
async function connect(port, token = randomUUID()) {
  const socket = io(`http://127.0.0.1:${port}`, { auth: { token }, transports: ['websocket'], forceNew: true });
  socket.on('lobby', lobby => { socket.lobby = lobby; });
  const identity = await new Promise((resolve, reject) => { socket.once('session', resolve); socket.once('connect_error', reject); });
  socket.playerId = identity.playerId; socket.token = token;
  return socket;
}

test('new lobby settings default to the preset for the selected player limit', () => {
  for (const [maxPlayers, expected] of [
    [2, [false, true, 9, 15]],
    [3, [false, true, 8, 12]],
    [4, [false, false, 7, 10]],
    [5, [true, false, 7, 10]],
    [6, [true, false, 7, 10]],
  ]) {
    const { extendedBoard, friendlyRobber, discardThreshold, victoryPoints } = validateSettings({ maxPlayers });
    assert.deepEqual([extendedBoard, friendlyRobber, discardThreshold, victoryPoints], expected, `${maxPlayers} players`);
  }
  const custom = validateSettings({ maxPlayers: 2, extendedBoard: true, friendlyRobber: false, victoryPoints: 9, discardThreshold: 11 });
  assert.deepEqual([custom.extendedBoard, custom.friendlyRobber, custom.discardThreshold, custom.victoryPoints], [true, false, 11, 9]);
  assert.deepEqual(validateSettings({ maxPlayers: 3 }, custom), { ...custom, maxPlayers: 3, extendedBoard: false });
});

test('settings reject invalid values', () => {
  assert.throws(() => validateSettings({ maxPlayers: 7 }));
  assert.throws(() => validateSettings({ turnSeconds: 5 }));
  assert.throws(() => validateSettings({ discardThreshold: '12' }));
  assert.throws(() => validateSettings({ extendedBoard: 'false' }));
});

test('real multiplayer server: lobby privacy, authority, readiness, masked state and reconnect', async t => {
  const server = await createAppServer({ port: 0, testMode: true, persistence: false });
  const clients = [];
  t.after(async () => { clients.forEach(c => c.disconnect()); await server.close(); });
  const a = await connect(server.port), b = await connect(server.port), c = await connect(server.port);
  clients.push(a, b, c);
  assert.equal((await call(a, 'createLobby', { playerName: 'Ada', name: 'North coast', settings: { turnSeconds: 0 } })).ok, true);
  const id = a.lobby.id;
  let listings = await (await fetch(`http://127.0.0.1:${server.port}/api/lobbies`)).json();
  assert.equal(listings.length, 1);
  assert.equal((await call(b, 'joinLobby', { id, playerName: 'Birch' })).ok, true);
  assert.equal((await call(b, 'configureLobby', { settings: { victoryPoints: 4 } })).ok, false);
  assert.equal((await call(a, 'startGame')).ok, false, 'cannot start with an unready guest');
  assert.equal((await call(a, 'configureLobby', { isPrivate: true, settings: { maxPlayers: 6, extendedBoard: false } })).ok, true);
  listings = await (await fetch(`http://127.0.0.1:${server.port}/api/lobbies`)).json();
  assert.equal(listings.length, 0, 'private lobbies never appear in directory');
  assert.equal((await call(c, 'joinLobby', { id, playerName: 'Ada' })).ok, false, 'duplicate names rejected');
  assert.equal((await call(c, 'joinLobby', { id, playerName: 'Cedar' })).ok, true, 'private room accepts invite code');
  assert.equal((await call(a, 'kickPlayer', { playerId: c.playerId })).ok, true);
  assert.equal(c.lobby, null);
  assert.equal((await call(b, 'setReady', { ready: true })).ok, true);
  assert.equal((await call(a, 'startGame')).ok, true);
  assert.equal(a.lobby.game.board.hexes.length, 19, 'small board override respected');
  for (const p of a.lobby.game.players) assert.equal(p.resources === null, p.id !== a.playerId);
  const before = JSON.stringify(server.lobbies.get(id).game);
  assert.equal((await call(b, 'gameAction', { type: 'placeSettlement', vertexId: 'not-a-real-vertex' })).ok, false);
  assert.equal(JSON.stringify(server.lobbies.get(id).game), before, 'invalid action has no partial mutations');
  assert.equal((await call(b, 'leaveLobby')).ok, false, 'active match preserves seats');
  const reconnectToken = b.token; const identity = b.playerId; b.disconnect();
  const resumed = await connect(server.port, reconnectToken); clients.push(resumed);
  // session event precedes lobby snapshot; request a directory round trip to flush events.
  await call(resumed, 'getDirectory');
  assert.equal(resumed.playerId, identity);
  assert.equal(resumed.lobby.id, id);
  assert.equal(resumed.lobby.status, 'playing');
  assert.equal((await call(a, 'chat', { text: '<script>alert(1)</script>' })).ok, true);
  assert.equal(a.lobby.messages.at(-1).text, '<script>alert(1)</script>', 'text is data for React escaping');
});

test('six clients can join, ready, start an expanded match and synchronize initial placements', async t => {
  const server = await createAppServer({ port: 0, testMode: true, persistence: false });
  const clients = [];
  t.after(async () => { clients.forEach(c => c.disconnect()); await server.close(); });
  for (let i = 0; i < 6; i++) clients.push(await connect(server.port));
  const host = clients[0];
  await call(host, 'createLobby', { playerName: 'Player 1', settings: { maxPlayers: 6, turnSeconds: 0 } });
  for (let i = 1; i < 6; i++) { assert.equal((await call(clients[i], 'joinLobby', { id: host.lobby.id, playerName: `Player ${i + 1}` })).ok, true); await call(clients[i], 'setReady', { ready: true }); }
  assert.equal((await call(host, 'startGame')).ok, true);
  assert.equal(host.lobby.game.board.hexes.length, 30);
  let placements = 0;
  while (server.lobbies.get(host.lobby.id).game.phase.startsWith('setup')) {
    const current = server.lobbies.get(host.lobby.id).game;
    const actor = clients.find(c => c.playerId === current.activePlayerId);
    await call(actor, 'getDirectory');
    const g = actor.lobby.game;
    const payload = g.phase === 'setupSettlement' ? { type: 'placeSettlement', vertexId: g.legal.settlements[0] } : { type: 'placeRoad', edgeId: g.legal.roads[0] };
    const result = await call(actor, 'gameAction', payload); assert.equal(result.ok, true, result.error);
    assert.ok(++placements <= 24);
  }
  assert.equal(placements, 24);
  for (const client of clients) { await call(client, 'getDirectory'); assert.equal(client.lobby.game.phase, 'roll'); }
});

test('a recipient can decline a pending offer during another player’s turn', async t => {
  const server = await createAppServer({ port: 0, testMode: true, persistence: false });
  const clients = [];
  t.after(async () => { clients.forEach(c => c.disconnect()); await server.close(); });
  for (let i = 0; i < 3; i++) clients.push(await connect(server.port));
  const [host, ...guests] = clients;
  await call(host, 'createLobby', { playerName: 'Ada', settings: { turnSeconds: 0 } });
  const id = host.lobby.id;
  for (const [i, guest] of guests.entries()) {
    await call(guest, 'joinLobby', { id, playerName: `Guest ${i + 1}` });
    await call(guest, 'setReady', { ready: true });
  }
  assert.equal((await call(host, 'startGame')).ok, true);
  const room = server.lobbies.get(id);
  const sender = clients.find(client => client.playerId === room.game.activePlayerId);
  const [recipient, otherRecipient] = clients.filter(client => client !== sender);
  // Seed the first action phase, leaving the recipients without any cards.
  room.game.phase = 'action';
  room.game.players.find(player => player.id === sender.playerId).resources.wood = 2;
  room.game.bank.wood -= 2;
  const send = (client, type, payload) => call(client, 'gameAction', { type, ...payload });
  assert.equal((await send(sender, 'offerTrade', { give: { wood: 1 }, want: { ore: 1 } })).ok, true);
  assert.equal((await send(sender, 'offerTrade', { give: { wood: 1 }, want: { brick: 1 } })).ok, true);
  await call(recipient, 'getDirectory');
  const [first, second] = recipient.lobby.game.tradeOffers.map(offer => offer.id);
  assert.notEqual(recipient.lobby.game.activePlayerId, recipient.playerId);

  assert.match((await send(recipient, 'endTurn')).error, /Wait for your turn/);
  const declined = await send(recipient, 'declineTrade', { offerId: first });
  assert.equal(declined.ok, true, declined.error);
  assert.deepEqual(recipient.lobby.game.tradeOffers.map(offer => offer.id), [second]);
  await call(otherRecipient, 'getDirectory');
  assert.deepEqual(otherRecipient.lobby.game.tradeOffers.map(offer => offer.id), [first, second]);

  room.game.phase = 'robber';
  assert.equal((await send(recipient, 'acceptTrade', { offerId: second })).ok, false);
  assert.equal((await send(recipient, 'declineTrade', { offerId: second })).ok, true, 'declining need not wait for the robber to move');
  assert.deepEqual(recipient.lobby.game.tradeOffers, []);
  assert.equal(room.game.activePlayerId, sender.playerId);
  assert.equal(room.game.phase, 'robber');
  assert.equal(room.game.players.find(player => player.id === sender.playerId).resources.wood, 2);
});
