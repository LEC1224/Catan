import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { io } from 'socket.io-client';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createAppServer } from '../server/index.js';
import { createGame, viewGame, tick } from '../server/game.js';
import { chooseBotAction } from '../src/bots/strategy.js';
import { simulateBots } from '../scripts/simulate-bots.js';

const call = (s, event, payload = {}) => new Promise((resolve, reject) => s.timeout(3000).emit(event, payload, (e, r) => e ? reject(e) : resolve(r)));
async function connect(port, token = randomUUID()) {
  const s = io(`http://127.0.0.1:${port}`, { auth: { token }, transports: ['websocket'], forceNew: true });
  s.token = token; s.on('lobby', l => s.lobby = l); s.on('botState', state => s.botState = state);
  const session = await new Promise((resolve, reject) => { s.once('session', resolve); s.once('connect_error', reject); });
  s.playerId = session.playerId; await call(s, 'getDirectory'); return s;
}
async function eventually(fn) {
  const until = Date.now() + 2000;
  while (!fn() && Date.now() < until) await delay(10);
  assert.ok(fn(), 'condition reached');
}
function botPayload(s, botId, action) {
  const { matchId, lease, revision } = s.botState;
  return { matchId, lease, revision, botId, action };
}

for (const [count, difficulty] of [[2, 'easy'], [4, 'normal'], [6, 'hard']]) {
  test(`${difficulty} bots complete a legal ${count}-player game from masked observations`, () => {
    const result = simulateBots(count, difficulty);
    assert.ok(result.winner); assert.ok(result.decisions > count * 4);
  });
}

test('bots handle variants including crowded boards, friendly robber and hand limits', () => {
  assert.ok(simulateBots(6, 'normal', { extendedBoard: false, friendlyRobber: true, hardHandLimit: 10, victoryPoints: 6 }).winner);
  assert.ok(simulateBots(3, 'hard', { allowPlayerTrading: false, discardThreshold: 3, victoryPoints: 6 }).winner);
});

test('bot policy trades and discards outside its turn without opponent private hands', () => {
  const g = createGame([{ id: 'human' }, { id: 'bot' }], { seed: 'policy' });
  g.phase = 'action'; g.activePlayerId = 'human';
  g.players[1].resources.wood = 4;
  g.tradeOffers = [
    { id: 'bad', from: 'human', give: { wood: 1 }, want: { ore: 3 }, declinedBy: [] },
    { id: 'offer', from: 'human', give: { brick: 2 }, want: { wood: 1 }, declinedBy: [] },
  ];
  const view = viewGame(g, 'bot'); assert.equal(view.players[0].resources, null);
  assert.deepEqual(chooseBotAction(view, 'bot'), { type: 'acceptTrade', offerId: 'offer' });
  g.tradeOffers.pop();
  assert.deepEqual(chooseBotAction(viewGame(g, 'bot'), 'bot'), { type: 'declineTrade', offerId: 'bad' });
  g.phase = 'discard'; g.discardRequired = { bot: 2 };
  const discard = chooseBotAction(viewGame(g, 'bot'), 'bot');
  assert.deepEqual(discard, { type: 'discard', resources: { wood: 2, brick: 0, wool: 0, wheat: 0, ore: 0 } });
});

test('server timers never select bot moves, including mixed human/bot discards', () => {
  const g = createGame([{ id: 'bot' }, { id: 'human' }], { turnSeconds: 30 });
  g.deadline = 1;
  const before = structuredClone(g); assert.equal(tick(g, Date.now(), ['bot']), false); assert.deepEqual(g, before);
  g.phase = 'discard'; g.discardRequired = { bot: 2, human: 2 };
  for (const p of g.players) { p.resources.wood = 4; g.bank.wood -= 4; }
  assert.equal(tick(g, Date.now(), ['bot']), true);
  assert.deepEqual(g.discardRequired, { bot: 2 }); assert.equal(g.players[0].resources.wood, 4);
  assert.equal(tick(g, Date.now(), ['bot']), false);
});

test('bot seats, private observations, controller authority, revisions and host handoff', async t => {
  const server = await createAppServer({ port: 0, testMode: true, persistence: false });
  const clients = []; t.after(async () => { clients.forEach(s => s.disconnect()); await server.close(); });
  const host = await connect(server.port), guest = await connect(server.port); clients.push(host, guest);
  await call(host, 'createLobby', { playerName: 'Host', settings: { turnSeconds: 0 } });
  const id = host.lobby.id, lobby = server.lobbies.get(id);
  await call(guest, 'joinLobby', { id, playerName: 'Guest' });
  assert.equal((await call(guest, 'addBot')).ok, false);
  assert.equal((await call(host, 'addBot', { difficulty: 'invalid' })).ok, false);
  assert.equal((await call(host, 'addBot', { difficulty: 'hard' })).ok, true);
  const bot = lobby.players.find(p => p.isBot);
  assert.equal((await call(host, 'transferHost', { playerId: bot.id })).ok, false);
  assert.equal((await call(host, 'configureBot', { playerId: bot.id, difficulty: 'easy' })).ok, true);
  assert.equal(bot.difficulty, 'easy');
  await call(host, 'configureLobby', { settings: { seed: 'controllers' } }); assert.equal(bot.ready, true);
  await call(guest, 'setReady', { ready: true });
  assert.equal((await call(host, 'startGame')).ok, true);
  await call(guest, 'getDirectory'); assert.equal(guest.botState, null);
  assert.ok(host.botState); assert.equal(host.botState.bots[0].game.players.find(p => p.id === guest.playerId).resources, null);
  assert.equal(host.lobby.game.players.find(p => p.id === bot.id).resources, null, 'normal UI snapshot hides bots too');
  assert.equal(host.botState.bots[0].game.players.find(p => p.id === host.playerId).resources, null, 'bot sees no host hand');
  // Reach the bot setup decision using legal human moves.
  while (lobby.game.activePlayerId !== bot.id) {
    const actor = clients.find(s => s.playerId === lobby.game.activePlayerId);
    await call(actor, 'getDirectory');
    const g = actor.lobby.game;
    assert.equal((await call(actor, 'gameAction', g.phase === 'setupSettlement' ? { type: 'placeSettlement', vertexId: g.legal.settlements[0] } : { type: 'placeRoad', edgeId: g.legal.roads[0] })).ok, true);
  }
  await call(host, 'getDirectory');
  const chosen = chooseBotAction(host.botState.bots[0].game, bot.id);
  const payload = botPayload(host, bot.id, chosen);
  assert.equal((await call(guest, 'botAction', payload)).ok, false);
  assert.equal((await call(host, 'botAction', { ...payload, botId: guest.playerId })).ok, false);
  const before = structuredClone(lobby.game);
  assert.equal((await call(host, 'botAction', { ...payload, action: { type: 'placeSettlement', vertexId: 'fake' } })).ok, false);
  assert.deepEqual(lobby.game, before);
  assert.equal((await call(host, 'botAction', payload)).ok, true);
  assert.equal((await call(host, 'botAction', payload)).ok, false, 'replay rejected');
  const duplicate = await connect(server.port, host.token); clients.push(duplicate);
  assert.equal(duplicate.botState, null, 'only one host tab receives bot hands');
  const roadPayload = botPayload(host, bot.id, chooseBotAction(host.botState.bots[0].game, bot.id));
  assert.equal((await call(duplicate, 'botAction', roadPayload)).ok, false, 'another host tab cannot reuse the lease');
  host.disconnect(); await eventually(() => duplicate.botState);
  assert.notEqual(duplicate.botState.lease, roadPayload.lease);
  assert.equal((await call(duplicate, 'botAction', roadPayload)).ok, false);
  const transferred = botPayload(duplicate, bot.id, chooseBotAction(duplicate.botState.bots[0].game, bot.id));
  await call(duplicate, 'transferHost', { playerId: guest.playerId }); await call(guest, 'getDirectory');
  assert.equal(duplicate.botState, null); assert.ok(guest.botState);
  assert.equal((await call(duplicate, 'botAction', transferred)).ok, false);
  assert.equal((await call(guest, 'botAction', botPayload(guest, bot.id, chooseBotAction(guest.botState.bots[0].game, bot.id)))).ok, true);
  assert.equal((await call(guest, 'configureBot', { playerId: bot.id, difficulty: 'hard' })).ok, false, 'difficulty locked during match');
  await call(guest, 'abandonGame'); assert.equal(guest.botState, null); assert.equal(bot.ready, true);
  await call(guest, 'kickPlayer', { playerId: bot.id }); assert.ok(!lobby.players.some(p => p.isBot));
});

test('solo host can start with bots; disconnect pauses bot play and never promotes a bot', async t => {
  const server = await createAppServer({ port: 0, testMode: true, persistence: false });
  const clients = []; t.after(async () => { clients.forEach(s => s.disconnect()); await server.close(); });
  const host = await connect(server.port); clients.push(host);
  await call(host, 'createLobby', { playerName: 'Solo', settings: { maxPlayers: 2, turnSeconds: 30 } });
  await call(host, 'addBot'); assert.equal((await call(host, 'addBot')).ok, false, 'capacity enforced');
  assert.equal((await call(host, 'startGame')).ok, true);
  const lobby = server.lobbies.get(host.lobby.id);
  host.disconnect(); await eventually(() => !lobby.players.some(p => p.connected));
  lobby.game.deadline = 1; lobby.players[0].disconnectedAt = Date.now() - 61000;
  const before = structuredClone(lobby.game); await delay(150);
  assert.deepEqual(lobby.game, before); assert.equal(lobby.hostId, host.playerId);
  const resumed = await connect(server.port, host.token); clients.push(resumed);
  assert.ok(resumed.botState); assert.equal(resumed.lobby.botsPaused, false);
  await call(resumed, 'abandonGame'); await call(resumed, 'leaveLobby');
  assert.equal(server.lobbies.size, 0, 'last human leaving removes the bot-only lobby');
});

test('disconnected host automatically hands bot control to a connected human', async t => {
  const server = await createAppServer({ port: 0, testMode: true, persistence: false });
  const clients = []; t.after(async () => { clients.forEach(s => s.disconnect()); await server.close(); });
  const host = await connect(server.port), guest = await connect(server.port); clients.push(host, guest);
  await call(host, 'createLobby', { playerName: 'Host', settings: { turnSeconds: 0 } });
  await call(host, 'addBot');
  await call(guest, 'joinLobby', { id: host.lobby.id, playerName: 'Guest' });
  await call(guest, 'setReady', { ready: true }); await call(host, 'startGame');
  const lobby = server.lobbies.get(host.lobby.id), oldLease = host.botState.lease;
  host.disconnect(); await eventually(() => guest.lobby.botsPaused);
  lobby.players.find(p => p.id === host.playerId).disconnectedAt = Date.now() - 61000;
  await eventually(() => guest.botState && guest.lobby.hostId === guest.playerId);
  assert.notEqual(guest.botState.lease, oldLease); assert.equal(guest.lobby.botsPaused, false);
  const resumed = await connect(server.port, host.token); clients.push(resumed);
  assert.equal(resumed.botState, null, 'former host cannot reclaim control merely by reconnecting');
});

test('saved bot seats and difficulty survive restart with a fresh controller lease', async t => {
  const tempRoot = path.resolve(tmpdir()), folder = await mkdtemp(path.join(tempRoot, 'catan-bots-'));
  const dataFile = path.join(folder, 'lobbies.json'), clients = [];
  let server = await createAppServer({ port: 0, testMode: true, persistence: true, dataFile });
  t.after(async () => {
    clients.forEach(s => s.disconnect()); if (server) await server.close();
    assert.equal(path.dirname(path.resolve(folder)), tempRoot); assert.ok(path.basename(folder).startsWith('catan-bots-'));
    await rm(folder, { recursive: true, force: true });
  });
  const host = await connect(server.port); clients.push(host);
  await call(host, 'createLobby', { playerName: 'Host', settings: { turnSeconds: 0 } });
  await call(host, 'addBot', { difficulty: 'hard' }); await call(host, 'startGame');
  const { id } = host.lobby, before = structuredClone(server.lobbies.get(id).game), oldLease = host.botState.lease;
  await server.close(); server = null; host.disconnect();
  server = await createAppServer({ port: 0, testMode: true, persistence: true, dataFile });
  const lobby = server.lobbies.get(id);
  assert.deepEqual(lobby.game, before); assert.equal(lobby.players.find(p => p.isBot).difficulty, 'hard');
  assert.ok(lobby.players.every(p => !p.connected));
  const resumed = await connect(server.port, host.token); clients.push(resumed);
  assert.ok(resumed.botState); assert.notEqual(resumed.botState.lease, oldLease);
  assert.equal(resumed.botState.bots[0].difficulty, 'hard');
});
