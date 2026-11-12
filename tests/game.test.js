import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, action, viewGame, tick, RESOURCES } from '../server/game.js';
import { MAX_TRADE_OFFERS } from '../shared/trades.js';

const players = n => Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `Player ${i}`, color: ['#a44', '#4a4', '#44a', '#aa4', '#a4a', '#4aa'][i] }));
const make = (n = 3, settings = {}) => createGame(players(n), { seed: 'engine-test', turnSeconds: 120, ...settings });
const total = map => Object.values(map).reduce((a, b) => a + b, 0);
function conservation(g) { for (const r of RESOURCES) assert.equal(g.bank[r] + g.players.reduce((n, p) => n + p.resources[r], 0), g.settings.extendedBoard || g.players.length >= 5 ? 24 : 19, r); }
function setup(g) {
  let guard = 0;
  while (g.phase.startsWith('setup')) {
    assert.ok(++guard < 30);
    const targets = viewGame(g, g.activePlayerId).legal;
    if (g.phase === 'setupSettlement') action(g, g.activePlayerId, 'placeSettlement', { vertexId: targets.settlements[0] });
    else action(g, g.activePlayerId, 'placeRoad', { edgeId: targets.roads[0] });
  }
  return g;
}
function ready(n = 3, settings = {}) { const g = setup(make(n, settings)); g.phase = 'action'; return g; }
function give(g, id, resource, count) { const p = g.players.find(p => p.id === id); const change = count - p.resources[resource]; p.resources[resource] = count; g.bank[resource] -= change; }
function card(g, id, type, turnBought = 0) { const c = { id: `test-${type}`, type, turnBought }; g.players.find(p => p.id === id).development.push(c); return c.id; }
function update(g) {
  g.tradeOffers.push({ id: 'refresh', from: g.activePlayerId, declinedBy: [] });
  action(g, g.activePlayerId, 'cancelTrade', { offerId: 'refresh' });
}
function path(g, length, forbidden = new Set()) {
  function walk(at, ids, visited) {
    if (ids.length === length) return ids;
    for (const id of g.board.vertices.find(v => v.id === at).edgeIds) {
      const e = g.board.edges.find(e => e.id === id), next = e.a === at ? e.b : e.a;
      if (forbidden.has(id) || visited.has(next)) continue;
      const result = walk(next, [...ids, id], new Set([...visited, next])); if (result) return result;
    }
  }
  for (const v of g.board.vertices) { const result = walk(v.id, [], new Set([v.id])); if (result) return result; }
}

test('standard and extended boards have correct topology and inventories', () => {
  for (const extendedBoard of [false, true]) {
    const g = make(extendedBoard ? 6 : 4, { extendedBoard });
    assert.equal(g.board.hexes.length, extendedBoard ? 30 : 19);
    assert.equal(g.board.vertices.length, extendedBoard ? 80 : 54);
    assert.equal(g.board.edges.length, extendedBoard ? 109 : 72);
    assert.equal(g.board.ports.length, extendedBoard ? 11 : 9);
    assert.equal(g.developmentDeck.length, extendedBoard ? 34 : 25);
    assert.equal(g.board.hexes.filter(h => h.terrain === 'desert').length, extendedBoard ? 2 : 1);
    assert.equal(new Set(g.board.ports.flatMap(p => p.vertexIds)).size, g.board.ports.length * 2);
    for (const e of g.board.edges) assert.ok(e.hexIds.length === 1 || e.hexIds.length === 2);
    conservation(g);
  }
});

test('board seeds reproduce terrain/numbers/ports, balanced reds never share an edge', () => {
  for (const extendedBoard of [false, true]) for (let i = 0; i < 30; i++) {
    const settings = { seed: `board-${i}`, extendedBoard }, a = make(3, settings), b = make(3, settings);
    assert.deepEqual(a.board, b.board);
    for (const h of a.board.hexes.filter(h => h.number === 6 || h.number === 8)) for (const other of a.board.hexes) {
      if (h.id !== other.id && (other.number === 6 || other.number === 8)) assert.equal(h.edgeIds.some(e => other.edgeIds.includes(e)), false);
    }
  }
});

test('five and six players retain expanded supplies when the small board is selected', () => {
  for (const count of [5, 6]) {
    const g = make(count, { extendedBoard: false });
    assert.equal(g.board.hexes.length, 19);
    assert.deepEqual(g.bank, { wood: 24, brick: 24, wool: 24, wheat: 24, ore: 24 });
    assert.equal(g.developmentDeck.length, 34);
    assert.equal(g.developmentDeck.filter(c => c.type === 'knight').length, 20);
    conservation(g);
  }
});

test('two through six players complete snake setup, including six on the standard board', () => {
  for (let n = 2; n <= 6; n++) for (const extendedBoard of [false, true]) {
    const g = make(n, { extendedBoard }), observed = [];
    while (g.phase.startsWith('setup')) {
      const view = viewGame(g, g.activePlayerId);
      if (g.phase === 'setupSettlement') { observed.push(g.activePlayerId); action(g, g.activePlayerId, 'placeSettlement', { vertexId: view.legal.settlements[0] }); }
      else action(g, g.activePlayerId, 'placeRoad', { edgeId: view.legal.roads[0] });
    }
    assert.deepEqual(observed, [...players(n).map(p => p.id), ...players(n).map(p => p.id).reverse()]);
    assert.equal(g.phase, 'roll'); assert.equal(g.activePlayerId, 'p0');
    for (const p of g.players) { assert.equal(p.score, 2); assert.equal(p.roadsLeft, 13); assert.equal(p.settlementsLeft, 3); assert.ok(total(p.resources) <= 3); }
    conservation(g);
  }
});

test('setup rejects nearby settlements and roads not adjacent to newly placed settlement', () => {
  const g = make(), vId = viewGame(g, 'p0').legal.settlements[0];
  action(g, 'p0', 'placeSettlement', { vertexId: vId });
  const v = g.board.vertices.find(v => v.id === vId), badEdge = g.board.edges.find(e => !v.edgeIds.includes(e.id));
  assert.throws(() => action(g, 'p0', 'placeRoad', { edgeId: badEdge.id }), /not legal/);
  action(g, 'p0', 'placeRoad', { edgeId: v.edgeIds[0] });
  assert.throws(() => action(g, 'p1', 'placeSettlement', { vertexId: v.neighborIds[0] }), /not legal/);
});

test('wrong turn and invalid payload leave the entire game unchanged', () => {
  const g = ready(), before = structuredClone(g);
  assert.throws(() => action(g, 'p1', 'endTurn'), /Wait/);
  assert.deepEqual(g, before);
  assert.throws(() => action(g, 'p0', 'offerTrade', { give: { wood: -1 }, want: { ore: 1 } }));
  assert.deepEqual(g, before);
});

test('roll produces for every player and preserves resources', () => {
  for (let i = 0; i < 50; i++) {
    const g = setup(make()), before = structuredClone(g);
    action(g, 'p0', 'rollDice');
    const rolled = g.dice.reduce((a, b) => a + b, 0);
    assert.ok(g.dice.every(n => Number.isInteger(n) && n >= 1 && n <= 6));
    if (rolled !== 7) for (const p of g.players) for (const r of RESOURCES) {
      const due = before.board.hexes.filter(h => h.number === rolled && h.id !== g.robberHexId && h.terrain === r).reduce((n, h) => n + h.vertexIds.filter(vId => before.board.vertices.find(v => v.id === vId).building?.owner === p.id).length, 0);
      assert.equal(p.resources[r], before.players.find(other => other.id === p.id).resources[r] + due);
    }
    conservation(g);
  }
});

test('seven uses configured threshold, rounds down, and prevents trading before discard', () => {
  let g;
  for (let i = 0; i < 300; i++) { g = setup(make(3, { discardThreshold: 5 })); give(g, 'p0', 'ore', 9); g.players[0].development.push({ id: 'vp', type: 'victoryPoint', turnBought: 0 }); action(g, 'p0', 'rollDice'); if (g.phase === 'discard') break; }
  assert.equal(g.phase, 'discard');
  const required = Math.floor(total(g.players[0].resources) / 2); assert.equal(g.discardRequired.p0, required);
  assert.throws(() => action(g, 'p0', 'bankTrade', { give: 'ore', receive: 'wood' }), /action phase/);
  action(g, 'p0', 'discard', { resources: { ore: required } });
  assert.equal(g.phase, 'robber'); assert.equal(g.players[0].development.length, 1);
  conservation(g);
});

test('Knights before the roll do not trigger discards and restore the roll phase', () => {
  const g = setup(make()); give(g, 'p0', 'ore', 10); const id = card(g, 'p0', 'knight');
  action(g, 'p0', 'playDevelopment', { cardId: id });
  assert.equal(g.phase, 'robber'); assert.deepEqual(g.discardRequired, {});
  const dest = viewGame(g, 'p0').legal.robberHexes.find(hId => g.board.hexes.find(h => h.id === hId).vertexIds.every(vId => !g.board.vertices.find(v => v.id === vId).building));
  action(g, 'p0', 'moveRobber', { hexId: dest });
  assert.equal(g.phase, 'roll'); assert.equal(g.developmentPlayed, true); assert.equal(g.players[0].resources.ore, 10);
  conservation(g);
});

test('robber must change hex and steals only one random resource, not development cards', () => {
  const g = ready(); g.phase = 'robber'; g.robberReturnPhase = 'action';
  assert.throws(() => action(g, 'p0', 'moveRobber', { hexId: g.robberHexId }), /different/);
  give(g, 'p1', 'ore', 5); card(g, 'p1', 'knight');
  const destination = g.board.hexes.find(h => h.id !== g.robberHexId && h.vertexIds.some(vId => g.board.vertices.find(v => v.id === vId).building?.owner === 'p1'));
  const before0 = total(g.players[0].resources), before1 = total(g.players[1].resources);
  action(g, 'p0', 'moveRobber', { hexId: destination.id });
  if (g.phase === 'steal') action(g, 'p0', 'steal', { targetId: 'p1' });
  assert.equal(total(g.players[0].resources), before0 + 1); assert.equal(total(g.players[1].resources), before1 - 1); assert.equal(g.players[1].development.length, 1);
  conservation(g);
});

test('friendly robber excludes opponents below three visible points', () => {
  const g = ready(3, { friendlyRobber: true }); g.phase = 'robber';
  const allowed = viewGame(g, 'p0').legal.robberHexes;
  for (const h of g.board.hexes) if (h.vertexIds.some(vId => { const b = g.board.vertices.find(v => v.id === vId).building; return b && b.owner !== 'p0'; })) assert.equal(allowed.includes(h.id), false);
});

test('building roads and cities charges resources, upgrades return settlement pieces', () => {
  const g = ready(); give(g, 'p0', 'wood', 2); give(g, 'p0', 'brick', 2);
  const road = viewGame(g, 'p0').legal.roads[0]; action(g, 'p0', 'placeRoad', { edgeId: road });
  assert.equal(g.players[0].wood, undefined); assert.equal(g.players[0].resources.wood, 1); assert.equal(g.players[0].roadsLeft, 12);
  give(g, 'p0', 'wheat', 2); give(g, 'p0', 'ore', 3);
  action(g, 'p0', 'upgradeCity', { vertexId: viewGame(g, 'p0').legal.cities[0] });
  assert.equal(g.players[0].settlementsLeft, 4); assert.equal(g.players[0].citiesLeft, 3); assert.equal(g.players[0].score, 3);
  conservation(g);
});

test('bank trading observes ports and refuses mixed/invalid or unavailable exchanges', () => {
  const g = ready(), p = g.players[0]; give(g, 'p0', 'wood', 10);
  for (const v of g.board.vertices) if (v.building?.owner === 'p0') v.port = null;
  action(g, 'p0', 'bankTrade', { give: 'wood', receive: 'ore' }); assert.equal(g.players[0].resources.wood, 6);
  const v = g.board.vertices.find(v => v.building?.owner === 'p0'); v.port = 'any';
  action(g, 'p0', 'bankTrade', { give: 'wood', receive: 'ore' }); assert.equal(g.players[0].resources.wood, 3);
  g.board.vertices.find(v => v.id === v.id && v.building?.owner === 'p0').port = 'wood';
  action(g, 'p0', 'bankTrade', { give: 'wood', receive: 'ore' }); assert.equal(g.players[0].resources.wood, 1);
  const before = structuredClone(g); assert.throws(() => action(g, 'p0', 'bankTrade', { give: 'wood', receive: 'ore' })); assert.deepEqual(g, before);
  conservation(g);
});

test('player trades are atomic, cannot be gifts, and require active player offers', () => {
  const g = ready(); give(g, 'p0', 'wood', 2); give(g, 'p1', 'ore', 2);
  assert.throws(() => action(g, 'p0', 'offerTrade', { give: { wood: 1 }, want: {} }), /at least/);
  assert.throws(() => action(g, 'p0', 'offerTrade', { give: { wood: 2 }, want: { wood: 1 } }), /same resource/);
  assert.throws(() => action(g, 'p1', 'offerTrade', { give: { ore: 1 }, want: { wood: 1 } }), /Wait/);
  action(g, 'p0', 'offerTrade', { give: { wood: 2 }, want: { ore: 1 } });
  const beforeWood = g.players[1].resources.wood, beforeOre = g.players[0].resources.ore;
  action(g, 'p1', 'acceptTrade', { offerId: g.tradeOffers[0].id });
  assert.equal(g.players[1].resources.wood, beforeWood + 2); assert.equal(g.players[0].resources.ore, beforeOre + 1); assert.equal(g.tradeOffers.length, 0);
  conservation(g);
});

test('concurrent offers can be declined, accepted and withdrawn independently', () => {
  const g = ready();
  give(g, 'p0', 'wood', 4);
  give(g, 'p1', 'ore', 2);
  give(g, 'p2', 'ore', 2);
  action(g, 'p0', 'offerTrade', { give: { wood: 1 }, want: { ore: 1 } });
  action(g, 'p0', 'offerTrade', { give: { wood: 2 }, want: { ore: 1 } });
  const [first, second] = g.tradeOffers.map(o => o.id);
  const ids = (id) => viewGame(g, id).tradeOffers.map(o => o.id);

  assert.throws(() => action(g, 'p1', 'cancelTrade', { offerId: first }), /sender/);
  action(g, 'p1', 'declineTrade', { offerId: first });
  assert.deepEqual(ids('p1'), [second]);
  assert.deepEqual(ids('p2'), [first, second]);
  assert.deepEqual(viewGame(g, 'p0').tradeOffers[0].declinedBy, ['p1']);
  assert.equal(viewGame(g, 'p2').tradeOffers[0].declinedBy, undefined);
  assert.throws(() => action(g, 'p1', 'acceptTrade', { offerId: first }), /declined/);
  action(g, 'p1', 'acceptTrade', { offerId: second });
  assert.deepEqual(ids('p0'), [first]);
  action(g, 'p2', 'declineTrade', { offerId: first });
  assert.deepEqual(ids('p0'), []);

  action(g, 'p0', 'offerTrade', { give: { wood: 1 }, want: { ore: 1 } });
  action(g, 'p0', 'cancelTrade', { offerId: g.tradeOffers[0].id });
  assert.deepEqual(ids('p2'), []);
  conservation(g);
});

test('offers cannot spend the same cards twice, and remaining offers expire at end of turn', () => {
  const g = ready();
  give(g, 'p0', 'wood', 2);
  give(g, 'p1', 'ore', 1);
  give(g, 'p2', 'ore', 1);
  const terms = { give: { wood: 2 }, want: { ore: 1 } };
  for (let i = 0; i < MAX_TRADE_OFFERS; i++) action(g, 'p0', 'offerTrade', terms);
  assert.throws(() => action(g, 'p0', 'offerTrade', terms), /Withdraw one/);
  const [first, second] = g.tradeOffers.map(o => o.id);
  action(g, 'p1', 'acceptTrade', { offerId: first });
  assert.equal(g.tradeOffers.length, 0);
  const before = structuredClone(g);
  assert.throws(() => action(g, 'p2', 'acceptTrade', { offerId: second }), /no longer open/);
  assert.deepEqual(g, before);

  action(g, 'p0', 'offerTrade', { give: { ore: 1 }, want: { wood: 1 } });
  action(g, 'p0', 'endTurn');
  assert.deepEqual(g.tradeOffers, []);
  conservation(g);
});

test('a saved match with one legacy offer can still complete that trade', () => {
  const g = ready();
  give(g, 'p0', 'wood', 1);
  give(g, 'p1', 'ore', 1);
  action(g, 'p0', 'offerTrade', { give: { wood: 1 }, want: { ore: 1 } });
  const { declinedBy, ...legacy } = g.tradeOffers[0];
  delete g.tradeOffers;
  g.tradeOffer = legacy;
  assert.deepEqual(viewGame(g, 'p1').tradeOffers, [legacy]);
  assert.deepEqual(viewGame(g, 'p1').tradeOffer, legacy);
  action(g, 'p1', 'acceptTrade');
  assert.equal(g.tradeOffer, undefined);
  assert.deepEqual(g.tradeOffers, []);
  conservation(g);
});

test('development purchase hides cards and enforces purchase-turn and one-card limits', () => {
  const g = ready(); give(g, 'p0', 'ore', 2); give(g, 'p0', 'wool', 2); give(g, 'p0', 'wheat', 2);
  g.developmentDeck.push({ id: 'bought', type: 'knight' }); action(g, 'p0', 'buyDevelopment');
  assert.throws(() => action(g, 'p0', 'playDevelopment', { cardId: 'bought' }), /turn you bought/);
  const id = card(g, 'p0', 'invention'); action(g, 'p0', 'playDevelopment', { cardId: id, resources: { wood: 2 } });
  card(g, 'p0', 'monopoly'); assert.throws(() => action(g, 'p0', 'playDevelopment', { cardId: 'test-monopoly', resource: 'ore' }), /only one/);
  const view = viewGame(g, 'p1'); assert.equal(view.players[0].resources, null); assert.equal(view.players[0].development, null); assert.equal(view.developmentDeck, undefined); assert.equal(view.setupOrder, undefined);
  assert.ok(viewGame(g, 'p0').players[0].resources);
  conservation(g);
});

test('invention failure does not partially grant resources; monopoly takes all matching cards', () => {
  const g = ready(), id = card(g, 'p0', 'invention'); give(g, 'p1', 'ore', g.players[1].resources.ore + g.bank.ore);
  const before = structuredClone(g); assert.throws(() => action(g, 'p0', 'playDevelopment', { cardId: id, resources: { wood: 1, ore: 1 } }), /supply/); assert.deepEqual(g, before);
  const m = card(g, 'p0', 'monopoly'); action(g, 'p0', 'playDevelopment', { cardId: m, resource: 'ore' });
  assert.equal(g.players[1].resources.ore, 0); assert.equal(g.players[2].resources.ore, 0); assert.equal(g.players[0].resources.ore, 19);
  conservation(g);
});

test('Road Building places two free legal roads and restores the pre-roll phase', () => {
  const g = setup(make()), id = card(g, 'p0', 'roadBuilding'), resources = structuredClone(g.players[0].resources);
  action(g, 'p0', 'playDevelopment', { cardId: id }); assert.equal(g.roadBuildingRemaining, 2);
  assert.throws(() => action(g, 'p0', 'endTurn'), /free roads/);
  action(g, 'p0', 'placeRoad', { edgeId: viewGame(g, 'p0').legal.roads[0] });
  action(g, 'p0', 'placeRoad', { edgeId: viewGame(g, 'p0').legal.roads[0] });
  assert.equal(g.phase, 'roll'); assert.equal(g.players[0].roadsLeft, 11); assert.deepEqual(g.players[0].resources, resources);
});

test('Longest Route counts loops, retains holder on ties, and is cut by opponent buildings', () => {
  const g = ready(); g.board.vertices.forEach(v => { v.building = null; }); g.board.edges.forEach(e => { e.owner = null; });
  const a = path(g, 6); a.forEach(id => { g.board.edges.find(e => e.id === id).owner = 'p0'; }); update(g);
  assert.equal(g.players[0].longestRoad, 6); assert.equal(g.longestRoadHolder, 'p0');
  const b = path(g, 6, new Set(a)); b.forEach(id => { g.board.edges.find(e => e.id === id).owner = 'p1'; }); update(g);
  assert.equal(g.longestRoadHolder, 'p0');
  const e2 = g.board.edges.find(e => e.id === a[2]), e3 = g.board.edges.find(e => e.id === a[3]), split = [e2.a, e2.b].find(v => [e3.a, e3.b].includes(v));
  g.board.vertices.find(v => v.id === split).building = { owner: 'p2', type: 'settlement' }; update(g);
  assert.equal(g.players[0].longestRoad, 3); assert.equal(g.longestRoadHolder, 'p1');
  g.board.vertices.forEach(v => { v.building = null; }); g.board.edges.forEach(e => { e.owner = null; });
  g.board.hexes[8].edgeIds.forEach(id => { g.board.edges.find(e => e.id === id).owner = 'p0'; }); update(g);
  assert.equal(g.players[0].longestRoad, 6);
});

test('Largest Army counts played Knights, remains on ties, and transfers on strict lead', () => {
  const g = ready(); g.players[0].knights = 3; update(g); assert.equal(g.largestArmyHolder, 'p0');
  g.players[1].knights = 3; update(g); assert.equal(g.largestArmyHolder, 'p0');
  g.players[1].knights = 4; update(g); assert.equal(g.largestArmyHolder, 'p1');
});

test('newly purchased victory point can win immediately and hidden scores stay private', () => {
  const g = ready(3, { victoryPoints: 4 }); card(g, 'p0', 'victoryPoint'); update(g);
  assert.equal(viewGame(g, 'p0').players[0].score, 3); assert.equal(viewGame(g, 'p1').players[0].score, 2);
  give(g, 'p0', 'ore', 1); give(g, 'p0', 'wool', 1); give(g, 'p0', 'wheat', 1); g.developmentDeck.push({ id: 'winning', type: 'victoryPoint' });
  action(g, 'p0', 'buyDevelopment'); assert.equal(g.phase, 'finished'); assert.equal(g.winnerId, 'p0'); assert.equal(g.deadline, null);
});

test('score reached outside own turn only wins when that player becomes active', () => {
  const g = ready(3, { victoryPoints: 3 }); card(g, 'p1', 'victoryPoint'); update(g); assert.notEqual(g.phase, 'finished');
  action(g, 'p0', 'endTurn'); assert.equal(g.phase, 'finished'); assert.equal(g.winnerId, 'p1');
});

test('paired turns give fourth player an action phase without roll or player trades', () => {
  const g = ready(6, { extendedBoard: true, pairedTurns: true }); action(g, 'p0', 'endTurn');
  assert.equal(g.activePlayerId, 'p3'); assert.equal(g.phase, 'action'); assert.equal(g.pairedPlayer, true);
  assert.throws(() => action(g, 'p3', 'rollDice'), /already rolled/);
  assert.throws(() => action(g, 'p3', 'offerTrade', { give: { wood: 1 }, want: { ore: 1 } }), /not available/);
  action(g, 'p3', 'endTurn'); assert.equal(g.activePlayerId, 'p1'); assert.equal(g.phase, 'roll'); assert.equal(g.pairedPlayer, false);
});

test('optional hard limit returns excess and never loses resources', () => {
  const g = ready(3, { hardHandLimit: 5 }); give(g, 'p0', 'ore', 12); update(g);
  assert.equal(total(g.players[0].resources), 5); conservation(g);
});

test('timers progress setup, forced discards, and turns; unlimited timer does nothing', () => {
  const g = make();
  while (g.phase.startsWith('setup')) { assert.equal(tick(g, g.deadline + 1), true); }
  assert.equal(g.phase, 'roll');
  let count = 0;
  while (g.activePlayerId === 'p0' && count++ < 8) tick(g, g.deadline + 1);
  assert.equal(g.activePlayerId, 'p1'); conservation(g);
  const unlimited = make(3, { turnSeconds: 0 }); assert.equal(tick(unlimited, Date.now() + 1e9), false);
  const discard = ready(); discard.phase = 'discard'; give(discard, 'p0', 'ore', 10); give(discard, 'p1', 'wood', 10); discard.discardRequired = { p0: 5, p1: 5 }; tick(discard, discard.deadline + 1); assert.equal(discard.phase, 'robber'); conservation(discard);
});
