import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { io } from 'socket.io-client';
import { createAppServer } from '../server/index.js';

const call = (socket, event, payload = {}) => new Promise((resolve, reject) => {
  socket.timeout(3000).emit(event, payload, (error, response) => error ? reject(error) : resolve(response));
});

async function connect(port, token = randomUUID()) {
  const socket = io(`http://127.0.0.1:${port}`, {
    auth: { token }, transports: ['websocket'], forceNew: true, reconnection: false,
  });
  socket.token = token;
  socket.on('lobby', lobby => { socket.lobby = lobby; });
  const session = await new Promise((resolve, reject) => {
    socket.once('session', resolve);
    socket.once('connect_error', reject);
  });
  socket.playerId = session.playerId;
  await call(socket, 'getDirectory');
  return socket;
}

async function eventually(predicate, description) {
  const until = Date.now() + 2000;
  while (!predicate() && Date.now() < until) await delay(5);
  assert.ok(predicate(), description);
}

async function startTwoPlayerGame(server, clients, settings = {}) {
  const host = await connect(server.port), guest = await connect(server.port);
  clients.push(host, guest);
  const created = await call(host, 'createLobby', {
    playerName: 'Harbor host', name: 'Lifecycle regression', settings: { turnSeconds: 30, ...settings },
  });
  assert.equal(created.ok, true, created.error);
  assert.equal((await call(guest, 'joinLobby', { id: created.id, playerName: 'Returning guest' })).ok, true);
  assert.equal((await call(guest, 'setReady', { ready: true })).ok, true);
  assert.equal((await call(host, 'startGame')).ok, true);
  return { host, guest, id: created.id, lobby: server.lobbies.get(created.id) };
}

test('all-offline matches pause expired timers and reconnect resumes with a fresh deadline', async t => {
  const server = await createAppServer({ port: 0, testMode: true, persistence: false });
  const clients = [];
  t.after(async () => { clients.forEach(socket => socket.disconnect()); await server.close(); });
  const { host, guest, lobby } = await startTwoPlayerGame(server, clients);
  host.disconnect(); guest.disconnect();
  await eventually(() => lobby.players.every(player => !player.connected), 'server observes both disconnects');
  // Expire after disconnect processing so the timer cannot legitimately fire while a player is still connected.
  lobby.game.deadline = Date.now() - 1;
  const gameBefore = structuredClone(lobby.game), updatedAtBefore = lobby.updatedAt;
  await delay(150); // Test-mode server polls every 50 ms.
  assert.deepEqual(lobby.game, gameBefore, 'no automatic placement or phase progression while everybody is offline');
  assert.equal(lobby.updatedAt, updatedAtBefore, 'offline timer checks must not refresh lobby activity');

  const beforeReconnect = Date.now();
  const resumed = await connect(server.port, guest.token); clients.push(resumed);
  assert.equal(resumed.lobby.id, lobby.id);
  assert.equal(resumed.lobby.game.phase, gameBefore.phase);
  assert.equal(resumed.lobby.game.activePlayerId, gameBefore.activePlayerId);
  assert.ok(resumed.lobby.game.deadline >= beforeReconnect + 30000, 'reconnection grants the configured thinking time');
  assert.ok(resumed.lobby.game.deadline <= Date.now() + 30000);
});

test('abandoned offline matches can expire instead of filling server capacity forever', async t => {
  const server = await createAppServer({ port: 0, testMode: true, persistence: false });
  const clients = [];
  t.after(async () => { clients.forEach(socket => socket.disconnect()); await server.close(); });
  const { host, guest, lobby, id } = await startTwoPlayerGame(server, clients);
  host.disconnect(); guest.disconnect();
  await eventually(() => lobby.players.every(player => !player.connected), 'both players are offline');
  lobby.updatedAt = Date.now() - 25 * 3600000;
  lobby.game.deadline = Date.now() - 1;
  await eventually(() => !server.lobbies.has(id), 'expired offline match releases its lobby slot');
  const resumed = await connect(server.port, host.token); clients.push(resumed);
  const created = await call(resumed, 'createLobby', { playerName: 'Fresh start' });
  assert.equal(created.ok, true, 'cleanup also releases the old player membership');
});

test('only the host can abandon a blocked unlimited-timer match and reopen its table', async t => {
  const server = await createAppServer({ port: 0, testMode: true, persistence: false });
  const clients = [];
  t.after(async () => { clients.forEach(socket => socket.disconnect()); await server.close(); });
  const { host, guest, lobby } = await startTwoPlayerGame(server, clients, { turnSeconds: 0 });
  const before = structuredClone(lobby.game);
  const rejected = await call(guest, 'abandonGame');
  assert.equal(rejected.ok, false);
  assert.match(rejected.error, /host/i);
  assert.deepEqual(lobby.game, before, 'guest cannot reset a match');
  guest.disconnect();
  await eventually(() => !lobby.players.find(player => player.id === guest.playerId).connected, 'guest is absent');
  assert.equal((await call(host, 'abandonGame')).ok, true);
  assert.equal(lobby.status, 'waiting');
  assert.equal(lobby.game, null);
  assert.deepEqual(lobby.players.map(player => player.ready), [true, false]);
  assert.match(lobby.messages.at(-1).text, /ended the match/i);
  assert.equal((await call(host, 'leaveLobby')).ok, true, 'host can leave after abandoning');
  assert.equal((await call(host, 'createLobby', { playerName: 'Next voyage' })).ok, true);
});

test('close flushes the newest match state and a restart restores seats and hidden hands', async t => {
  const tempRoot = path.resolve(tmpdir());
  const tempDirectory = await mkdtemp(path.join(tempRoot, 'catan-lifecycle-'));
  const dataFile = path.join(tempDirectory, 'lobbies.json');
  const clients = [];
  let server = await createAppServer({ port: 0, testMode: true, persistence: true, dataFile });
  t.after(async () => {
    clients.forEach(socket => socket.disconnect());
    if (server) await server.close();
    // Only remove the exact task-owned directory created by mkdtemp inside the system temp root.
    assert.equal(path.dirname(path.resolve(tempDirectory)), tempRoot);
    assert.ok(path.basename(tempDirectory).startsWith('catan-lifecycle-'));
    await rm(tempDirectory, { recursive: true, force: true });
  });
  const { host, guest, id, lobby } = await startTwoPlayerGame(server, clients, { turnSeconds: 0 });
  const active = clients.find(socket => socket.playerId === lobby.game.activePlayerId);
  await call(active, 'getDirectory');
  const target = active.lobby.game.legal.settlements[0];
  assert.equal((await call(active, 'gameAction', { type: 'placeSettlement', vertexId: target })).ok, true);
  await delay(70); // Allow the interval to write an earlier snapshot before the final mutation.
  assert.equal((await call(host, 'chat', { text: 'Last action immediately before shutdown.' })).ok, true);
  const gameBeforeClose = structuredClone(lobby.game);
  await server.close(); server = null;
  host.disconnect(); guest.disconnect();

  const saved = JSON.parse(await readFile(dataFile, 'utf8'));
  assert.equal(saved.lobbies.length, 1);
  assert.equal(saved.lobbies[0].messages.at(-1).text, 'Last action immediately before shutdown.');
  assert.deepEqual(saved.lobbies[0].game, gameBeforeClose);

  server = await createAppServer({ port: 0, testMode: true, persistence: true, dataFile });
  const restored = server.lobbies.get(id);
  assert.ok(restored, 'lobby was loaded from disk');
  assert.equal(restored.status, 'playing');
  assert.ok(restored.players.every(player => !player.connected), 'restored sockets are initially disconnected');
  assert.deepEqual(restored.game, gameBeforeClose);
  const resumed = await connect(server.port, guest.token); clients.push(resumed);
  assert.equal(resumed.playerId, guest.playerId);
  assert.equal(resumed.lobby.id, id);
  assert.equal(resumed.lobby.game.phase, 'setupRoad');
  assert.equal(resumed.lobby.game.deadline, null, 'unlimited timer remains unlimited across restart');
  for (const player of resumed.lobby.game.players) assert.equal(player.resources === null, player.id !== resumed.playerId);
});
