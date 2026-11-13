import { call, connect } from './helpers/socket-client.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createGame, action, viewGame } from '../server/game.js';
import { createAppServer, validateSettings } from '../server/index.js';
import { appendFrame, beginRecording, captureMove, lastLogSequence, matchSummary, viewReplay } from '../server/match-recording.js';
import { teamSeating, areTeammates } from '../shared/teams.js';
import { replayBoard } from '../shared/match-replay.js';
import { chooseBotAction } from '../src/bots/strategy.js';
import { lobbySoundCues } from '../src/sound-cues.js';
import { simulateBots } from '../scripts/simulate-bots.js';

const players = Array.from({ length: 4 }, (_, i) => ({ id: `p${i}`, name: `Player ${i}`, color: ['#a44', '#4a4', '#44a', '#aa4'][i] }));
function ready(settings = {}) {
  const g = createGame(players, { mode: 'teams', seed: 'teams', turnSeconds: 0, ...settings });
  while (g.phase.startsWith('setup')) {
    const legal = viewGame(g, g.activePlayerId).legal;
    if (g.phase === 'setupSettlement') action(g, g.activePlayerId, 'placeSettlement', { vertexId: legal.settlements[0] });
    else action(g, g.activePlayerId, 'placeRoad', { edgeId: legal.roads[0] });
  }
  g.phase = 'action';
  return g;
}
function points(g, id, score) {
  const p = g.players.find(p => p.id === id);
  p.development = Array.from({ length: score - p.visibleScore }, (_, i) => ({ id: `${id}-vp-${i}`, type: 'victoryPoint', turnBought: 0 }));
  p.score = score; p.developmentCount = p.development.length;
}

test('team settings require four players, two on each side, and alternate assigned partners', () => {
  assert.equal(validateSettings({ mode: 'teams' }).maxPlayers, 4);
  assert.equal(validateSettings({ mode: 'teams' }).teamVictoryPoints, 16);
  const custom = validateSettings({ maxPlayers: 6, map: 'sweden', victoryPoints: 18 });
  const teams = validateSettings({ mode: 'teams' }, custom);
  assert.equal(teams.map, 'sweden');
  assert.equal(teams.maxPlayers, 4);
  assert.equal(validateSettings({ mode: 'individual' }, teams).victoryPoints, 18);
  for (const input of [{ mode: 'invalid' }, { mode: 'teams', maxPlayers: 3 }, { teamVictoryPoints: 11 }, { teamVictoryPoints: 31 }]) assert.throws(() => validateSettings(input));
  assert.throws(() => createGame(players.slice(0, 3), { mode: 'teams' }), /four players/);
  assert.throws(() => createGame(players, { mode: 'teams', teamVictoryPoints: 3 }), /between 12 and 30/);
  const defaults = createGame(players, { mode: 'teams', teamVictoryPoints: undefined, maxPlayers: 6 });
  assert.equal(defaults.settings.teamVictoryPoints, 16);
  assert.equal(defaults.settings.maxPlayers, 4);
  assert.throws(() => teamSeating(players.map(p => ({ ...p, teamId: 'a' }))), /two players/);
  const assigned = players.map((p, i) => ({ ...p, teamId: i < 2 ? 'a' : 'b' }));
  const game = createGame(assigned, { mode: 'teams' });
  assert.deepEqual(game.players.map(p => p.id), ['p0', 'p2', 'p1', 'p3']);
  assert.deepEqual(game.players.map(p => p.teamId), ['a', 'b', 'a', 'b']);
  const rotated = [...game.players.slice(1), game.players[0]];
  assert.deepEqual(teamSeating(rotated), rotated, 'keep randomized starting seat');
});

test('team victory needs the combined target and six points from each teammate', () => {
  for (const [first, second, wins] of [[11, 5, false], [8, 7, false], [10, 6, true], [8, 8, true]]) {
    const g = ready(); points(g, 'p0', first); points(g, 'p2', second);
    g.phase = 'roll'; action(g, 'p0', 'rollDice');
    assert.equal(g.phase === 'finished', wins, `${first} + ${second}`);
    assert.equal(g.winnerTeamId, wins ? 'a' : null);
    if (wins) {
      assert.equal(g.winnerId, 'p0');
      assert.match(g.log.at(-1).text, /Team A \(Player 0 and Player 2\) won/);
    }
  }
});

test('a qualifying team wins on either teammate’s turn, with a configurable team target', () => {
  const g = ready({ teamVictoryPoints: 18 });
  points(g, 'p0', 10); points(g, 'p2', 8);
  g.activePlayerId = 'p1'; g.primaryIndex = 1;
  // Trading is an ordinary action that refreshes scoring without changing the turn.
  g.players[1].resources.wood++;
  g.bank.wood--;
  action(g, 'p1', 'offerTrade', { give: { wood: 1 }, want: { ore: 1 } });
  assert.equal(g.winnerId, null, 'an opposing turn cannot declare the team winner');
  action(g, 'p1', 'endTurn');
  assert.equal(g.winnerTeamId, 'a');
  assert.equal(g.winnerId, 'p2');
});

test('partners retain private hands, private victory cards, and individual roads and ports', () => {
  const g = ready(); points(g, 'p2', 9);
  const view = viewGame(g, 'p0'), partner = view.players.find(p => p.id === 'p2');
  assert.equal(partner.resources, null);
  assert.equal(partner.development, null);
  assert.equal(partner.score, partner.visibleScore);
  assert.ok(areTeammates(view, 'p0', 'p2'));
  assert.ok(!areTeammates(view, 'p0', 'p1'));
  const target = g.board.vertices.find(v => v.building?.owner === 'p2');
  assert.ok(!view.legal.cities.includes(target.id));
  const allyRoad = g.board.edges.find(e => e.owner === 'p2');
  assert.ok(!view.legal.roads.includes(allyRoad.id));
  assert.equal(matchSummary(g, beginRecording(g)), null, 'no private score history while playing');
});

test('team results, replay scores, and sounds credit both winners', () => {
  const g = ready({ map: 'sweden' });
  const recording = beginRecording(g);
  points(g, 'p0', 10); points(g, 'p2', 6);
  const before = structuredClone(g), sequence = lastLogSequence(g);
  g.phase = 'roll'; action(g, 'p0', 'rollDice');
  appendFrame(recording, captureMove(g, 'p0', 'rollDice', sequence));
  const summary = matchSummary(g, recording);
  assert.deepEqual(summary.timeline.at(-1).teamTotals, [16, 4]);
  assert.deepEqual(summary.timeline.at(-1).leaders, [0]);
  assert.match(summary.moments.find(m => m.kind === 'win').text, /Team A won with 16 points/);
  const replay = viewReplay(recording, { step: 1, playerId: 'p1' });
  assert.equal(replayBoard(g.board, replay.position).map, 'sweden');
  assert.equal(replay.frame.points[2].total, 6);
  for (const [meId, expected] of [['p0', 'won'], ['p2', 'won'], ['p1', 'finished'], ['p3', 'finished']]) {
    const lobby = game => ({ id: 'room', matchId: 'match', meId, game });
    assert.equal(lobbySoundCues(lobby(before), lobby(g)).at(-1), expected);
  }
});

test('bots avoid robbing partners and can trade with a partner who has a high score', () => {
  const g = ready();
  for (const v of g.board.vertices) v.building = null;
  const allyHex = g.board.hexes.find(h => h.terrain !== 'desert');
  const enemyHex = g.board.hexes.find(h => h.terrain !== 'desert' && !h.vertexIds.some(id => allyHex.vertexIds.includes(id)));
  for (const [hex, owner] of [[allyHex, 'p2'], [enemyHex, 'p1']]) {
    hex.number = 6;
    g.board.vertices.find(v => v.id === hex.vertexIds[0]).building = { owner, type: 'city' };
  }
  g.phase = 'robber';
  const view = viewGame(g, 'p0');
  view.legal.robberHexes = [allyHex.id, enemyHex.id];
  assert.equal(chooseBotAction(view, 'p0', 'hard', {}, () => .5).hexId, enemyHex.id);
  g.phase = 'steal'; g.stealTargets = ['p2', 'p1'];
  assert.equal(chooseBotAction(viewGame(g, 'p0'), 'p0', 'hard', {}, () => .5).targetId, 'p1');
  g.phase = 'action'; g.activePlayerId = 'p2';
  g.players[0].resources.wood = 4;
  g.players[2].visibleScore = 14;
  g.tradeOffers = [{ id: 'partner', from: 'p2', give: { brick: 2 }, want: { wood: 1 }, declinedBy: [] }];
  assert.deepEqual(chooseBotAction(viewGame(g, 'p0'), 'p0', 'hard'), { type: 'acceptTrade', offerId: 'partner' });
});

for (const map of ['classic', 'narrows', 'sweden']) test(`bots complete a legal 2v2 match on ${map}`, () => {
  assert.ok(simulateBots(4, 'normal', { map, mode: 'teams' }).winner);
});

test('multiplayer teams enforce host authority, readiness, balanced seating, and persist across restarts', async t => {
  const directory = await mkdtemp(path.join(tmpdir(), 'catan-teams-'));
  const dataFile = path.join(directory, 'lobbies.json');
  let server = await createAppServer({ port: 0, testMode: true, dataFile });
  const clients = [];
  t.after(async () => { clients.forEach(c => c.disconnect()); await server.close(); await rm(directory, { recursive: true, force: true }); });
  const host = await connect(server.port), guest = await connect(server.port); clients.push(host, guest);
  await call(host, 'createLobby', { playerName: 'Host', settings: { mode: 'teams', map: 'narrows', turnSeconds: 0 } });
  const id = host.lobby.id;
  await call(guest, 'joinLobby', { id, playerName: 'Guest' });
  await call(host, 'addBot');
  assert.equal((await call(host, 'startGame')).ok, false);
  await call(host, 'addBot');
  const bots = host.lobby.players.filter(p => p.isBot);
  assert.equal((await call(guest, 'setPlayerTeam', { playerId: guest.playerId, teamId: 'a' })).ok, false);
  assert.equal((await call(host, 'setPlayerTeam', { playerId: guest.playerId, teamId: 'c' })).ok, false);
  await call(guest, 'setReady', { ready: true });
  assert.equal((await call(host, 'setPlayerTeam', { playerId: guest.playerId, teamId: 'a' })).ok, true);
  assert.equal(host.lobby.players.find(p => p.id === guest.playerId).ready, false);
  await call(guest, 'setReady', { ready: true });
  assert.match((await call(host, 'startGame')).error, /two players/);
  await call(host, 'setPlayerTeam', { playerId: bots[0].id, teamId: 'b' });
  await call(host, 'configureLobby', { settings: { map: 'sweden' } });
  await call(guest, 'setReady', { ready: true });
  assert.equal((await call(host, 'startGame')).ok, true);
  const game = host.lobby.game;
  assert.equal(game.board.hexes.length, 30);
  assert.ok(game.players.every((p, i) => p.teamId !== game.players[(i + 1) % 4].teamId));
  assert.equal(game.players.find(p => p.id === guest.playerId).teamId, 'a');
  assert.equal(game.players.find(p => p.id === guest.playerId).resources, null);
  assert.equal((await call(host, 'setPlayerTeam', { playerId: guest.playerId, teamId: 'b' })).ok, false);
  const savedPlayers = game.players.map(p => [p.id, p.teamId]);
  const token = host.token;
  clients.forEach(c => c.disconnect());
  await server.close();
  server = await createAppServer({ port: 0, testMode: true, dataFile });
  const resumed = await connect(server.port, token); clients.push(resumed);
  assert.equal(resumed.lobby.game.settings.mode, 'teams');
  assert.equal(resumed.lobby.game.settings.teamVictoryPoints, 16);
  assert.equal(resumed.lobby.game.board.map, 'sweden');
  assert.deepEqual(resumed.lobby.game.players.map(p => [p.id, p.teamId]), savedPlayers);
});
