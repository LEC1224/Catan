import test from 'node:test';
import assert from 'node:assert/strict';
import crypto, { randomUUID } from 'node:crypto';
import { syncBuiltinESMExports } from 'node:module';
import { mkdtemp, rm, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { io } from 'socket.io-client';
import { createAppServer } from '../server/index.js';
import { action, createGame, tick, viewGame } from '../server/game.js';
import { appendFrame, beginRecording, captureMove, lastLogSequence, matchSummary } from '../server/match-recording.js';
import { replayBoard } from '../shared/match-replay.js';

const players = [{ id: 'ada', name: 'Ada', color: '#ce6849' }, { id: 'birch', name: 'Birch', color: '#3b8292' }];
const rpc = (client, event, payload = {}) => client.timeout(3000).emitWithAck(event, payload);
async function connect(server, token = randomUUID()) {
  const client = io(`http://127.0.0.1:${server.port}`, { auth: { token }, transports: ['websocket'], forceNew: true, reconnection: false });
  client.on('lobby', snapshot => { client.lobby = snapshot; });
  const { playerId } = await new Promise((resolve, reject) => { client.once('session', resolve); client.once('connect_error', reject); });
  Object.assign(client, { playerId, token });
  return client;
}

function record(game, recording, id, type, payload) {
  const seq = lastLogSequence(game);
  action(game, id, type, payload);
  appendFrame(recording, captureMove(game, id, type, seq));
}

test('match summary credits actual points and preserves when they changed', () => {
  const game = createGame(players, { seed: 'results', victoryPoints: 8 });
  const recording = beginRecording(game);
  while (game.phase.startsWith('setup')) {
    assert.ok(tick(game, game.deadline, [], (id, type, seq) => appendFrame(recording, captureMove(game, id, type, seq, true))));
  }
  assert.equal(recording.frames.length, 9, 'setup includes each automatic settlement and road');
  assert.equal(recording.frames[1].move.automatic, true);
  assert.match(recording.frames[1].move.text, /built a settlement/);
  assert.equal(matchSummary(game, recording), null, 'hidden points stay out of live summaries');

  game.phase = 'action';
  const ada = game.players[0];
  const adaSite = game.board.vertices.find(v => v.building?.owner === ada.id).id;
  Object.assign(ada.resources, { wheat: 3, ore: 4, wool: 1 });
  record(game, recording, ada.id, 'upgradeCity', { vertexId: adaSite });
  record(game, recording, ada.id, 'endTurn');
  game.phase = 'action';
  const birch = game.players[1];
  const birchSite = game.board.vertices.find(v => v.building?.owner === birch.id).id;
  Object.assign(birch.resources, { wheat: 2, ore: 3 });
  record(game, recording, birch.id, 'upgradeCity', { vertexId: birchSite });
  record(game, recording, birch.id, 'endTurn');
  game.phase = 'action';

  // Arrange an existing five-edge route and three played Knights; the next action
  // calculates both awards and purchases the last, hidden point.
  const pathFrom = (at, seen) => {
    if (seen.size === 6) return [];
    for (const e of game.board.edges.filter(e => e.a === at || e.b === at)) {
      const next = e.a === at ? e.b : e.a;
      if (seen.has(next) || game.board.vertices.find(v => v.id === next).building?.owner === birch.id) continue;
      const rest = pathFrom(next, new Set([...seen, next]));
      if (rest) return [e, ...rest];
    }
    return null;
  };
  for (const e of pathFrom(adaSite, new Set([adaSite]))) e.owner = ada.id;
  game.players[0].knights = 3;
  game.developmentDeck.push({ id: 'private-card-id', type: 'victoryPoint' });
  record(game, recording, ada.id, 'buyDevelopment');
  assert.equal(game.phase, 'finished');
  const summary = matchSummary(game, recording);
  assert.equal(summary.turns, 3);
  assert.deepEqual(summary.scores, [
    { id: 'ada', settlements: 1, cities: 2, cards: 1, route: 2, army: 2, total: 8 },
    { id: 'birch', settlements: 1, cities: 2, cards: 0, route: 0, army: 0, total: 3 },
  ]);
  assert.deepEqual(summary.timeline.find(point => point.step === 9).leaders, [0]);
  assert.deepEqual(summary.timeline.find(point => point.step === 11).leaders, [0, 1]);
  assert.ok(['city', 'lead', 'route', 'army', 'win'].every(kind => summary.moments.some(moment => moment.kind === kind)));
  assert.ok(summary.moments.every(moment => recording.frames[moment.step]?.turn === moment.turn));
  assert.equal(JSON.stringify(recording).includes('private-card-id'), false);
  assert.equal(matchSummary(structuredClone(game)).history, 'unavailable');
});

test('a timeout records the roll before the same tick advances the turn', t => {
  const game = createGame(players, { seed: 'replay-dice' });
  Object.assign(game, { phase: 'roll', turn: 1 });
  const recording = beginRecording(game, true);
  const dice = t.mock.method(crypto, 'randomInt', () => 3);
  syncBuiltinESMExports();
  try {
    tick(game, game.deadline, [], (id, type, seq) => appendFrame(recording, captureMove(game, id, type, seq, true)));
  } finally {
    dice.mock.restore();
    syncBuiltinESMExports();
  }
  assert.deepEqual(recording.frames.slice(1).map(({ turn, dice, move }) => [turn, dice, move.type]), [
    [1, [3, 3], 'rollDice'], [2, null, 'endTurn'],
  ]);
  assert.equal(recording.positions.length, 1, 'the two actions reuse the board position');
});

test('guests share the replay cursor, reconstruct board state, and resume it after restart', async t => {
  const dir = await mkdtemp(path.join(tmpdir(), 'lecatani-replay-'));
  const options = { port: 0, testMode: true, dataFile: path.join(dir, 'lobbies.json') };
  let server = await createAppServer(options);
  const clients = [];
  t.after(async () => {
    clients.forEach(client => client.disconnect());
    await server.close();
    await rm(options.dataFile, { force: true });
    await rmdir(dir);
  });
  const host = await connect(server), guest = await connect(server), outsider = await connect(server);
  clients.push(host, guest, outsider);
  const { id } = await rpc(host, 'createLobby', { playerName: 'Ada', settings: { turnSeconds: 0, victoryPoints: 3, extendedBoard: true, seed: 'recording' } });
  assert.ok((await rpc(guest, 'joinLobby', { id, playerName: 'Birch' })).ok);
  await rpc(guest, 'setReady', { ready: true });
  assert.ok((await rpc(host, 'startGame')).ok);
  const lobby = server.lobbies.get(id);
  const seek = (client, step, matchId = lobby.matchId) => rpc(client, 'seekReplay', { matchId, step });
  assert.equal((await seek(guest, 0)).ok, false, 'live games cannot be replayed');
  assert.equal(host.lobby.replay, null);
  assert.equal(lobby.recording.frames.length, 1);
  const currentClient = () => clients.find(client => client.playerId === lobby.game.activePlayerId);
  assert.equal((await rpc(currentClient(), 'gameAction', { type: 'placeSettlement', vertexId: 'invalid' })).ok, false);
  assert.equal(lobby.recording.frames.length, 1, 'rejected commands do not add frames');
  while (lobby.game.phase.startsWith('setup')) {
    const player = currentClient();
    const legal = viewGame(lobby.game, player.playerId).legal;
    const move = lobby.game.phase === 'setupSettlement'
      ? { type: 'placeSettlement', vertexId: legal.settlements[0] }
      : { type: 'placeRoad', edgeId: legal.roads[0] };
    assert.ok((await rpc(player, 'gameAction', move)).ok);
  }
  assert.equal(host.lobby.summary, null);
  assert.equal(Object.hasOwn(host.lobby, 'recording'), false);
  const winner = currentClient();
  lobby.game.phase = 'action';
  const player = lobby.game.players.find(p => p.id === winner.playerId);
  Object.assign(player.resources, { wheat: 2, ore: 3 });
  const { cities } = viewGame(lobby.game, player.id).legal;
  assert.ok((await rpc(winner, 'gameAction', { type: 'upgradeCity', vertexId: cities[0] })).ok);
  await rpc(guest, 'getDirectory');
  assert.equal(guest.lobby.status, 'finished');
  assert.equal(guest.lobby.summary.history, 'complete');
  assert.equal(guest.lobby.summary.frameCount, 10);
  assert.equal(guest.lobby.summary.scores.find(s => s.id === winner.playerId).total, 3);
  const lastStep = guest.lobby.summary.frameCount - 1;
  assert.equal((await seek(guest, 0, 'previous-match')).ok, false);
  assert.equal((await seek(outsider, 0)).ok, false);
  assert.equal((await seek(guest, lastStep + 1)).ok, false);
  assert.equal((await seek(guest, 1.5)).ok, false);
  assert.ok((await seek(guest, 0)).ok, 'a non-host opens replay for the room');
  await rpc(host, 'getDirectory');
  assert.deepEqual(host.lobby.replay, guest.lobby.replay);
  assert.deepEqual(host.lobby.replay.position, { buildings: [], roads: [] });
  assert.deepEqual(host.lobby.replay.frame.points.map(p => p.total), [0, 0]);
  assert.equal(host.lobby.replay.frame.robber, host.lobby.game.robberHexId);
  const seekBoth = async (client, step) => {
    assert.ok((await seek(client, step)).ok);
    await rpc(client === host ? guest : host, 'getDirectory');
    assert.deepEqual(host.lobby.replay, guest.lobby.replay);
    assert.equal(host.lobby.replay.step, step);
    assert.equal(host.lobby.replay.playerId, client.playerId);
  };
  await seekBoth(host, 2);
  const earlyBoard = replayBoard(host.lobby.game.board, host.lobby.replay.position);
  assert.equal(earlyBoard.hexes.length, 30);
  assert.equal(earlyBoard.vertices.filter(v => v.building?.type === 'settlement').length, 1);
  assert.equal(earlyBoard.edges.filter(e => e.owner).length, 1);
  assert.deepEqual(earlyBoard.hexes, host.lobby.game.board.hexes);
  await seekBoth(guest, lastStep);
  assert.deepEqual(replayBoard(host.lobby.game.board, host.lobby.replay.position), host.lobby.game.board);
  await seekBoth(host, 1);
  assert.ok((await rpc(guest, 'chat', { text: 'Let’s look at the opening move.' })).ok);
  await rpc(host, 'getDirectory');
  assert.equal(host.lobby.messages.at(-1).text, 'Let’s look at the opening move.');
  assert.equal(host.lobby.replay.step, 1);

  const savedCursor = host.lobby.replay;
  clients.forEach(client => client.disconnect());
  await server.close();
  server = await createAppServer(options);
  const returningHost = await connect(server, host.token), returningGuest = await connect(server, guest.token);
  clients.push(returningHost, returningGuest);
  await rpc(returningHost, 'getDirectory');
  await rpc(returningGuest, 'getDirectory');
  assert.deepEqual(returningGuest.lobby.replay, savedCursor);
  assert.equal(returningHost.lobby.summary.frameCount, lastStep + 1);
  assert.ok((await rpc(returningHost, 'returnToLobby')).ok);
  assert.equal(returningHost.lobby.summary, null);
  assert.equal(returningHost.lobby.replay, null);
  assert.equal(server.lobbies.get(id).recording, undefined);
});
