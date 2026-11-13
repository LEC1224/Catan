import { randomInt, randomUUID } from 'node:crypto';
import { resourceName } from '../shared/resource-names.js';
import { boardMap, centerCellIndex } from '../shared/board-maps.js';
import { DEFAULT_TEAM_TARGET, gameTeams, TEAM_MIN_POINTS, teamSeating } from '../shared/teams.js';
import { bankTradeRate, MAX_BANK_TRADE_CARDS, MAX_TRADE_OFFERS, openTradeOffers, playerTradesAvailable, resourceStock } from '../shared/trades.js';
import { bank, moveResources, playerHand, recordDeal, tile, viewCardDeals } from './card-deals.js';

export const RESOURCES = ['wood', 'brick', 'wool', 'wheat', 'ore'];
const COSTS = { road: { wood: 1, brick: 1 }, settlement: { wood: 1, brick: 1, wool: 1, wheat: 1 }, city: { wheat: 2, ore: 3 }, development: { wool: 1, wheat: 1, ore: 1 } };
const DEFAULTS = { maxPlayers: 4, extendedBoard: false, lockDesertToCenter: false, victoryPoints: 10, discardThreshold: 7, hardHandLimit: 0, turnSeconds: 120, friendlyRobber: false, balancedNumbers: true, unlimitedDevelopmentCards: true, unlimitedResourceCards: false, allowPlayerTrading: true, pairedTurns: true, seed: '' };
const emptyResources = () => Object.fromEntries(RESOURCES.map(r => [r, 0]));
const sum = map => RESOURCES.reduce((n, r) => n + (map[r] || 0), 0);
const fail = text => { throw new Error(text); };
const requireThat = (condition, text) => { if (!condition) fail(text); };
const player = (g, id) => g.players.find(p => p.id === id);
// Generated h/v/e IDs match their array slots. Keep a fallback for reordered
// snapshots and custom fixtures without maintaining mutable lookup caches.
function boardItem(items, id) {
  const indexed = typeof id === 'string' ? items[id.slice(1)] : undefined;
  return indexed?.id === id ? indexed : items.find(item => item.id === id);
}
const vertex = (g, id) => boardItem(g.board.vertices, id);
const edge = (g, id) => boardItem(g.board.edges, id);
const hex = (g, id) => boardItem(g.board.hexes, id);
function addLog(g, text, cue) {
  const seq = (g.log.at(-1)?.seq ?? 0) + 1;
  g.log.push({ text, at: Date.now(), seq, ...(cue && { cue }) });
  if (g.log.length > 120) g.log.shift();
}
const setDeadline = g => { g.deadline = g.settings.turnSeconds ? Date.now() + g.settings.turnSeconds * 1000 : null; };
function phase(g, value) { g.phase = value; setDeadline(g); }
function shuffle(items, random = n => randomInt(n)) { for (let i = items.length - 1; i > 0; i--) { const j = random(i + 1); [items[i], items[j]] = [items[j], items[i]]; } return items; }
function seededRandom(seed) {
  let state = 2166136261;
  for (const c of String(seed)) { state ^= c.charCodeAt(0); state = Math.imul(state, 16777619); }
  return n => { state += 0x6D2B79F5; let t = state; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return Math.floor(((t ^ t >>> 14) >>> 0) / 4294967296 * n); };
}

function buildBoard(settings) {
  const random = settings.seed ? seededRandom(settings.seed) : n => randomInt(n);
  const map = boardMap(settings);
  const counts = settings.extendedBoard ? [6, 5, 6, 6, 5, 2] : [4, 3, 4, 4, 3, 1];
  const terrains = [...RESOURCES, 'desert'].flatMap((r, i) => Array(counts[i]).fill(r));
  if (settings.lockDesertToCenter) terrains.pop();
  shuffle(terrains, random);
  if (settings.lockDesertToCenter) terrains.splice(centerCellIndex(map.cells), 0, 'desert');
  const vertices = [], edges = [], hexes = [], vertexMap = new Map(), edgeMap = new Map();
  for (const { x, y } of map.cells) {
      const h = { id: `h${hexes.length}`, x, y, terrain: terrains[hexes.length], number: null, vertexIds: [], edgeIds: [] };
      for (let k = 0; k < 6; k++) {
        const angle = (k * 60 - 90) * Math.PI / 180, vx = x + 60 * Math.cos(angle), vy = y + 60 * Math.sin(angle);
        const key = `${Math.round(vx * 1000)},${Math.round(vy * 1000)}`;
        let v = vertexMap.get(key);
        if (!v) { v = { id: `v${vertices.length}`, x: vx, y: vy, hexIds: [], edgeIds: [], neighborIds: [], building: null, port: null }; vertices.push(v); vertexMap.set(key, v); }
        v.hexIds.push(h.id); h.vertexIds.push(v.id);
      }
      for (let k = 0; k < 6; k++) {
        const a = h.vertexIds[k], b = h.vertexIds[(k + 1) % 6], key = [a, b].sort().join(':');
        let e = edgeMap.get(key);
        if (!e) { e = { id: `e${edges.length}`, a, b, owner: null, hexIds: [] }; edges.push(e); edgeMap.set(key, e); boardItem(vertices, a).edgeIds.push(e.id); boardItem(vertices, b).edgeIds.push(e.id); boardItem(vertices, a).neighborIds.push(b); boardItem(vertices, b).neighborIds.push(a); }
        e.hexIds.push(h.id); h.edgeIds.push(e.id);
      }
      hexes.push(h);
  }
  const productive = hexes.filter(h => h.terrain !== 'desert');
  const numbers = [2, 3, 4, 5, 6, 8, 9, 10, 11, 12].flatMap(n => Array(settings.extendedBoard ? (n === 2 || n === 12 ? 2 : 3) : (n === 2 || n === 12 ? 1 : 2)).fill(n));
  // Place frequent red numbers on an independent set; remaining numbers are unconstrained.
  if (settings.balancedNumbers) {
    const redCount = settings.extendedBoard ? 6 : 4;
    let selected = null;
    for (let attempt = 0; attempt < 200 && !selected; attempt++) {
      const chosen = [];
      for (const h of shuffle([...productive], random)) {
        if (!chosen.some(other => h.edgeIds.some(id => other.edgeIds.includes(id)))) chosen.push(h);
        if (chosen.length === redCount) { selected = chosen; break; }
      }
    }
    requireThat(selected, 'Could not create a balanced board. Try another seed.');
    const reds = shuffle(numbers.filter(n => n === 6 || n === 8), random), rest = shuffle(numbers.filter(n => n !== 6 && n !== 8), random);
    for (const h of productive) h.number = selected.includes(h) ? reds.pop() : rest.pop();
  } else { shuffle(numbers, random); productive.forEach((h, i) => { h.number = numbers[i]; }); }
  let coastalEdges = edges.filter(e => e.hexIds.length === 1).sort((a, b) => {
    const av = boardItem(vertices, a.a), aw = boardItem(vertices, a.b), bv = boardItem(vertices, b.a), bw = boardItem(vertices, b.b);
    return Math.atan2(av.y + aw.y, av.x + aw.x) - Math.atan2(bv.y + bw.y, bv.x + bw.x);
  });
  // Walk the real perimeter on shaped maps; angles skip around inward coastlines.
  if (!['classic', 'expanded'].includes(map.id)) {
    const remaining = new Set(coastalEdges);
    const ordered = [];
    let at = coastalEdges[0].a;
    while (remaining.size) {
      const next = [...remaining].find(e => e.a === at || e.b === at);
      requireThat(next, 'The map coastline must be connected.');
      ordered.push(next); remaining.delete(next);
      at = next.a === at ? next.b : next.a;
    }
    coastalEdges = ordered;
  }
  const portTypes = shuffle(['any', 'any', 'any', 'any', ...RESOURCES, ...(settings.extendedBoard ? ['any', 'wool'] : [])], random);
  const ports = [];
  portTypes.forEach((type, i) => {
    const e = coastalEdges[Math.floor(i * coastalEdges.length / portTypes.length)];
    boardItem(vertices, e.a).port = type; boardItem(vertices, e.b).port = type;
    ports.push({ id: `port${i}`, type, vertexIds: [e.a, e.b], edgeId: e.id });
  });
  return { map: map.id, hexes, vertices, edges, ports };
}

function resourceMap(value, { nonzero = false, maxQuantity = 150 } = {}) {
  requireThat(value && typeof value === 'object' && !Array.isArray(value), 'Choose resource quantities.');
  requireThat(Object.keys(value).every(k => RESOURCES.includes(k)), 'Unknown resource.');
  const map = emptyResources();
  for (const r of RESOURCES) { const n = value[r] ?? 0; requireThat(Number.isSafeInteger(n) && n >= 0 && n <= maxQuantity, 'Resource quantities must be whole, non-negative numbers.'); map[r] = n; }
  requireThat(!nonzero || sum(map) > 0, 'Choose at least one resource.');
  return map;
}
function canPay(p, cost) { return Object.entries(cost).every(([r, n]) => p.resources[r] >= n); }
function changeStock(g, r, amount) { if (g.bank[r] !== null) g.bank[r] += amount; }
function pay(g, p, cost, moves) {
  requireThat(canPay(p, cost), 'You do not have enough resources.');
  for (const [r, n] of Object.entries(cost)) { p.resources[r] -= n; changeStock(g, r, n); }
  if (moves) moveResources(moves, playerHand(p.id), bank, cost);
}
function grant(g, p, map) { for (const [r, n] of Object.entries(map)) { requireThat(resourceStock(g.bank, r) >= n, `The supply does not have enough ${resourceName(r)}.`); changeStock(g, r, -n); p.resources[r] += n; } }
function produceResources(g, total, moves) {
  const due = Object.fromEntries(RESOURCES.map(r => [r, new Map()]));
  for (const h of g.board.hexes) if (h.number === total && h.id !== g.robberHexId) {
    const recipients = due[h.terrain];
    for (const vId of h.vertexIds) {
      const building = vertex(g, vId).building;
      if (!building) continue;
      if (!recipients.has(building.owner)) recipients.set(building.owner, new Map());
      const tiles = recipients.get(building.owner);
      tiles.set(h.id, (tiles.get(h.id) ?? 0) + (building.type === 'city' ? 2 : 1));
    }
  }
  for (const r of RESOURCES) {
    const recipients = due[r];
    const demand = [...recipients.values()].flatMap(tiles => [...tiles.values()]).reduce((n, count) => n + count, 0);
    if (demand > resourceStock(g.bank, r) && recipients.size > 1) {
      addLog(g, `The ${resourceName(r)} supply cannot cover production; nobody receives ${resourceName(r)}.`);
      continue;
    }
    for (const [id, tiles] of recipients) for (const [hexId, count] of tiles) {
      const paid = Math.min(count, resourceStock(g.bank, r));
      if (!paid) break;
      const resources = { [r]: paid };
      grant(g, player(g, id), resources);
      moveResources(moves, tile(hexId), playerHand(id), resources);
    }
  }
}
function enforceHandLimits(g) {
  if (!g.settings.hardHandLimit) return;
  for (const p of g.players) {
    let excess = sum(p.resources) - g.settings.hardHandLimit, removed = 0;
    while (excess-- > 0) { const r = [...RESOURCES].sort((a, b) => p.resources[b] - p.resources[a])[0]; p.resources[r]--; changeStock(g, r, 1); removed++; }
    if (removed) addLog(g, `${p.name} returned ${removed} cards above the hard hand limit (largest piles first).`);
  }
}

function roadLength(g, id, owned) {
  if (!owned.length) return 0;
  const at = new Map();
  owned.forEach((e, index) => {
    // Players have at most 15 roads, so visited edges fit in a 32-bit mask.
    const bit = 1 << index;
    for (const [from, to] of [[e.a, e.b], [e.b, e.a]]) {
      if (!at.has(from)) at.set(from, []);
      at.get(from).push({ to, bit });
    }
  });
  const blocked = new Set(g.board.vertices.filter(v => v.building && v.building.owner !== id).map(v => v.id));
  let longest = 0;
  function walk(v, used, length) {
    longest = Math.max(longest, length);
    if (longest === owned.length || length && blocked.has(v)) return;
    for (const { to, bit } of at.get(v)) if (!(used & bit)) walk(to, used | bit, length + 1);
  }
  for (const v of at.keys()) {
    walk(v, 0, 0);
    if (longest === owned.length) break;
  }
  return longest;
}
function updateScores(g) {
  const pieces = new Map(g.players.map(p => [p.id, { settlements: 0, cities: 0, roads: [] }]));
  for (const { building } of g.board.vertices) if (building) {
    const owned = pieces.get(building.owner);
    if (!owned) continue;
    if (building.type === 'settlement') owned.settlements++;
    else if (building.type === 'city') owned.cities++;
  }
  for (const road of g.board.edges) if (road.owner) pieces.get(road.owner)?.roads.push(road);
  for (const p of g.players) {
    const owned = pieces.get(p.id);
    p.settlementsLeft = 5 - owned.settlements;
    p.citiesLeft = 4 - owned.cities;
    p.roadsLeft = 15 - owned.roads.length;
    p.longestRoad = roadLength(g, p.id, owned.roads);
  }
  const previousRoad = g.longestRoadHolder, maximum = Math.max(...g.players.map(p => p.longestRoad));
  const leaders = g.players.filter(p => p.longestRoad === maximum);
  g.longestRoadHolder = maximum < 5 ? null : leaders.some(p => p.id === previousRoad) ? previousRoad : leaders.length === 1 ? leaders[0].id : null;
  const previousArmy = g.largestArmyHolder, mostKnights = Math.max(...g.players.map(p => p.knights));
  const armyLeaders = g.players.filter(p => p.knights === mostKnights);
  g.largestArmyHolder = mostKnights < 3 ? null : armyLeaders.some(p => p.id === previousArmy) ? previousArmy : armyLeaders.length === 1 ? armyLeaders[0].id : null;
  for (const p of g.players) {
    p.resourceCount = sum(p.resources); p.developmentCount = p.development.length;
    p.visibleScore = 5 - p.settlementsLeft + 2 * (4 - p.citiesLeft) + (g.longestRoadHolder === p.id ? 2 : 0) + (g.largestArmyHolder === p.id ? 2 : 0);
    p.score = p.visibleScore + p.development.filter(c => c.type === 'victoryPoint').length;
  }
  if (previousRoad !== g.longestRoadHolder && g.longestRoadHolder) addLog(g, `${player(g, g.longestRoadHolder).name} claimed Longest Route.`, 'longestRoute');
  if (previousArmy !== g.largestArmyHolder && g.largestArmyHolder) addLog(g, `${player(g, g.largestArmyHolder).name} claimed Largest Army.`, 'largestArmy');
}
function checkVictory(g) {
  if (g.phase.startsWith('setup') || g.phase === 'finished') return;
  const p = player(g, g.activePlayerId);
  if (!p) return;
  let message;
  if (g.settings.mode === 'teams') {
    const team = gameTeams(g).find(team => team.id === p.teamId);
    const score = team.players.reduce((sum, p) => sum + p.score, 0);
    if (score < g.settings.teamVictoryPoints || !team.players.every(p => p.score >= TEAM_MIN_POINTS)) return;
    g.winnerTeamId = team.id;
    message = `${team.name} (${team.players.map(p => p.name).join(' and ')}) won with ${score} victory points!`;
  } else {
    if (p.score < g.settings.victoryPoints) return;
    message = `${p.name} won with ${p.score} victory points!`;
  }
  g.winnerId = p.id; g.phase = 'finished'; g.deadline = null; g.tradeOffers = []; addLog(g, message);
}
function settlementTargets(g, id, setup = false) {
  const p = player(g, id);
  if (!p || p.settlementsLeft < 1) return [];
  return g.board.vertices.filter(v => !v.building && v.neighborIds.every(n => !vertex(g, n).building) && (setup || v.edgeIds.some(e => edge(g, e).owner === id))).map(v => v.id);
}
function roadTargets(g, id, setup = false) {
  if (!player(g, id)?.roadsLeft) return [];
  return g.board.edges.filter(e => !e.owner && (setup ? [e.a, e.b].includes(g.setupVertexId) : [e.a, e.b].some(vId => { const v = vertex(g, vId); return v.building ? v.building.owner === id : v.edgeIds.some(eId => edge(g, eId).owner === id); }))).map(e => e.id);
}
function robberTargets(g, id) {
  return g.board.hexes.filter(h => h.id !== g.robberHexId && (!g.settings.friendlyRobber || !h.vertexIds.some(vId => { const b = vertex(g, vId).building; return b && b.owner !== id && player(g, b.owner).visibleScore < 3; }))).map(h => h.id);
}
function legal(g, id) {
  const result = { settlements: [], roads: [], cities: [], robberHexes: [] };
  if (id !== g.activePlayerId || g.phase === 'finished') return result;
  if (g.phase === 'setupSettlement') result.settlements = settlementTargets(g, id, true);
  if (g.phase === 'setupRoad') result.roads = roadTargets(g, id, true);
  if (g.phase === 'action') {
    result.roads = roadTargets(g, id);
    if (!g.roadBuildingRemaining) {
      result.settlements = settlementTargets(g, id);
      if (player(g, id).citiesLeft) result.cities = g.board.vertices.filter(v => v.building?.owner === id && v.building.type === 'settlement').map(v => v.id);
    }
  }
  if (g.phase === 'robber') result.robberHexes = robberTargets(g, id);
  return result;
}
function startTurn(g, index, paired = false) {
  g.activePlayerId = g.players[index].id; g.pairedPlayer = paired; g.turn++; g.developmentPlayed = false;
  g.roadBuildingRemaining = 0; g.tradeOffers = []; g.discardRequired = {}; g.stealTargets = []; g.dice = paired ? g.dice : null;
  phase(g, paired ? 'action' : 'roll');
  addLog(g, `${g.players[index].name}'s ${paired ? 'paired action' : 'turn'}.`);
  checkVictory(g);
}
function nextTurn(g) {
  if (g.settings.pairedTurns && g.players.length >= 5 && !g.pairedPlayer) startTurn(g, (g.primaryIndex + 3) % g.players.length, true);
  else { g.primaryIndex = (g.primaryIndex + 1) % g.players.length; startTurn(g, g.primaryIndex); }
}
function activateRobber(g, returnPhase = 'action') {
  g.robberReturnPhase = returnPhase;
  if (!robberTargets(g, g.activePlayerId).length) { addLog(g, 'Friendly robber: no eligible destination, so the robber stays.'); phase(g, returnPhase); }
  else phase(g, 'robber');
}

const usesExpandedSupply = (players, settings) => players.length >= 5 || settings.extendedBoard;

function makeDevelopmentDeck(expandedSupply) {
  const deckTypes = [['knight', expandedSupply ? 20 : 14], ['victoryPoint', 5], ['roadBuilding', expandedSupply ? 3 : 2], ['invention', expandedSupply ? 3 : 2], ['monopoly', expandedSupply ? 3 : 2]];
  return shuffle(deckTypes.flatMap(([type, n]) => Array.from({ length: n }, () => ({ id: randomUUID(), type }))));
}

export function createGame(players, settings = {}) {
  requireThat(players.length >= 2 && players.length <= 6, 'A game needs two to six players.');
  requireThat(new Set(players.map(p => p.id)).size === players.length, 'Player IDs must be unique.');
  requireThat(settings.mode === undefined || ['individual', 'teams'].includes(settings.mode), 'Choose a valid game mode.');
  if (settings.mode === 'teams') {
    players = teamSeating(players);
    const target = settings.teamVictoryPoints ?? DEFAULT_TEAM_TARGET;
    requireThat(Number.isInteger(target) && target >= 12 && target <= 30, 'Team points to win must be between 12 and 30.');
  }
  const map = boardMap(settings);
  const merged = { ...DEFAULTS, ...settings, mode: settings.mode ?? 'individual', teamVictoryPoints: settings.teamVictoryPoints ?? DEFAULT_TEAM_TARGET, ...(settings.mode === 'teams' && { maxPlayers: 4 }), map: map.id, extendedBoard: map.cells.length > 19 }, board = buildBoard(merged);
  const expandedSupply = usesExpandedSupply(players, merged);
  const stock = merged.unlimitedResourceCards ? null : expandedSupply ? 24 : 19;
  const g = {
    settings: merged, board, players: players.map(p => ({ id: p.id, name: p.name, color: p.color, ...(merged.mode === 'teams' && { teamId: p.teamId }), resources: emptyResources(), development: [], resourceCount: 0, developmentCount: 0, knights: 0, roadsLeft: 15, settlementsLeft: 5, citiesLeft: 4, score: 0, visibleScore: 0, longestRoad: 0 })),
    bank: Object.fromEntries(RESOURCES.map(r => [r, stock])),
    developmentDeck: makeDevelopmentDeck(expandedSupply), playedDevelopment: [],
    phase: 'setupSettlement', activePlayerId: players[0].id, turn: 0, deadline: null, winnerId: null, winnerTeamId: null, dice: null,
    robberHexId: (merged.lockDesertToCenter ? board.hexes[centerCellIndex(board.hexes)] : board.hexes.find(h => h.terrain === 'desert')).id,
    longestRoadHolder: null, largestArmyHolder: null,
    log: [], pairedPlayer: false, primaryIndex: 0, setupOrder: [...players.map(p => p.id), ...players.map(p => p.id).reverse()], setupIndex: 0, setupVertexId: null,
    discardRequired: {}, stealTargets: [], tradeOffers: [], roadBuildingRemaining: 0, developmentPlayed: false,
  };
  setDeadline(g); addLog(g, 'Place your first settlement and road.');
  if (merged.mode === 'teams') addLog(g, `2v2: first team to ${merged.teamVictoryPoints} points wins, with at least ${TEAM_MIN_POINTS} points per teammate.`);
  if (players.length === 2) addLog(g, 'Two-player casual variant: standard core rules without neutral players.');
  return g;
}

function respondToTrade(g, p, type, offerId, moves) {
  // Turning an offer down doesn't spend cards or interrupt a pending board action.
  if (type !== 'declineTrade') requireThat(playerTradesAvailable(g), 'Player trading is not available now.');
  // Older clients can accept or withdraw the only offer they can see.
  const legacyResponse = offerId === undefined && type !== 'declineTrade' && g.tradeOffers.length === 1;
  const index = legacyResponse ? 0 : g.tradeOffers.findIndex((offer) => offer.id === offerId);
  requireThat(index >= 0, 'That trade offer is no longer open.');
  const offer = g.tradeOffers[index];
  if (type === 'cancelTrade') {
    requireThat(offer.from === p.id, 'Only the sender can withdraw this offer.');
    g.tradeOffers.splice(index, 1);
    return;
  }
  requireThat(offer.from !== p.id, 'You cannot respond to your own offer.');
  requireThat(!offer.declinedBy.includes(p.id), 'You already declined this offer.');
  const sender = player(g, offer.from);
  if (type === 'declineTrade') {
    offer.declinedBy.push(p.id);
    if (offer.declinedBy.length === g.players.length - 1) {
      g.tradeOffers.splice(index, 1);
      addLog(g, `All players declined ${sender.name}’s offer.`);
    }
    return;
  }
  requireThat(canPay(sender, offer.give) && canPay(p, offer.want), 'One player no longer has the offered resources.');
  for (const r of RESOURCES) {
    p.resources[r] += offer.give[r] - offer.want[r];
    sender.resources[r] += offer.want[r] - offer.give[r];
  }
  moveResources(moves, playerHand(sender.id), playerHand(p.id), offer.give);
  moveResources(moves, playerHand(p.id), playerHand(sender.id), offer.want);
  g.tradeOffers.splice(index, 1);
  addLog(g, `${p.name} traded with ${sender.name}.`, 'trade');
}

function applyAction(g, id, type, payload, moves) {
  const p = player(g, id);
  requireThat(p, 'You are not a player in this game.');
  requireThat(g.phase !== 'finished', 'This game has ended.');
  if (type === 'discard') {
    requireThat(g.phase === 'discard' && g.discardRequired[id] > 0, 'You do not need to discard.');
    const resources = resourceMap(payload.resources, { maxQuantity: Math.max(150, g.discardRequired[id]) });
    requireThat(sum(resources) === g.discardRequired[id], `Discard exactly ${g.discardRequired[id]} resources.`);
    pay(g, p, resources); delete g.discardRequired[id]; addLog(g, `${p.name} discarded ${sum(resources)} resources.`, 'discard');
    if (!Object.keys(g.discardRequired).length) activateRobber(g);
    return;
  }
  if (['acceptTrade', 'declineTrade', 'cancelTrade'].includes(type)) return respondToTrade(g, p, type, payload.offerId, moves);
  requireThat(g.activePlayerId === id, 'Wait for your turn.');
  if (g.roadBuildingRemaining) requireThat(type === 'placeRoad', 'Finish placing your free roads first.');
  switch (type) {
    case 'placeSettlement': {
      const setup = g.phase === 'setupSettlement';
      requireThat(setup || g.phase === 'action', 'You cannot build a settlement now.');
      requireThat(settlementTargets(g, id, setup).includes(payload.vertexId), 'That settlement position is not legal.');
      if (!setup) pay(g, p, COSTS.settlement, moves);
      const v = vertex(g, payload.vertexId); v.building = { owner: id, type: 'settlement' }; addLog(g, `${p.name} built a settlement.`, 'settlement');
      if (setup) {
        g.setupVertexId = v.id;
        if (g.setupIndex >= g.players.length) for (const hId of v.hexIds) {
          const h = hex(g, hId);
          if (h.terrain === 'desert') continue;
          const resources = { [h.terrain]: 1 };
          grant(g, p, resources);
          moveResources(moves, tile(h.id), playerHand(id), resources);
        }
        phase(g, 'setupRoad');
      }
      break;
    }
    case 'placeRoad': {
      const setup = g.phase === 'setupRoad';
      requireThat(setup || g.phase === 'action', 'You cannot build a road now.');
      requireThat(roadTargets(g, id, setup).includes(payload.edgeId), 'That road position is not legal.');
      if (!setup && !g.roadBuildingRemaining) pay(g, p, COSTS.road, moves);
      edge(g, payload.edgeId).owner = id; addLog(g, `${p.name} built a road.`, 'road');
      if (setup) {
        g.setupIndex++;
        if (g.setupIndex === g.setupOrder.length) { updateScores(g); startTurn(g, 0); }
        else { g.activePlayerId = g.setupOrder[g.setupIndex]; phase(g, 'setupSettlement'); }
      } else if (g.roadBuildingRemaining) {
        g.roadBuildingRemaining--; updateScores(g);
        if (!roadTargets(g, id).length) g.roadBuildingRemaining = 0;
        if (!g.roadBuildingRemaining) phase(g, g.roadBuildingReturnPhase || 'action');
      }
      break;
    }
    case 'upgradeCity': {
      requireThat(g.phase === 'action', 'You can upgrade only in your action phase.');
      const v = vertex(g, payload.vertexId);
      requireThat(v?.building?.owner === id && v.building.type === 'settlement' && p.citiesLeft > 0, 'Choose one of your settlements and an available city.');
      pay(g, p, COSTS.city, moves); v.building.type = 'city'; addLog(g, `${p.name} upgraded a settlement to a city.`, 'city'); break;
    }
    case 'rollDice': {
      requireThat(g.phase === 'roll', 'You have already rolled this turn.');
      g.dice = [randomInt(1, 7), randomInt(1, 7)]; const total = g.dice[0] + g.dice[1]; addLog(g, `${p.name} rolled ${total}.`, total === 7 ? 'diceSeven' : 'dice');
      if (total === 7) {
        g.discardRequired = Object.fromEntries(g.players.filter(other => sum(other.resources) > g.settings.discardThreshold).map(other => [other.id, Math.floor(sum(other.resources) / 2)]));
        if (Object.keys(g.discardRequired).length) phase(g, 'discard'); else activateRobber(g);
      } else {
        produceResources(g, total, moves);
        phase(g, 'action');
      }
      break;
    }
    case 'moveRobber': {
      requireThat(g.phase === 'robber', 'You cannot move the robber now.');
      requireThat(robberTargets(g, id).includes(payload.hexId), 'Choose a different eligible hex for the robber.');
      g.robberHexId = payload.hexId;
      g.stealTargets = [...new Set(hex(g, payload.hexId).vertexIds.map(vId => vertex(g, vId).building?.owner).filter(owner => owner && owner !== id && sum(player(g, owner).resources) > 0))];
      addLog(g, `${p.name} moved the robber.`, 'robber');
      if (!g.stealTargets.length) phase(g, g.robberReturnPhase || 'action');
      else if (g.stealTargets.length === 1) { phase(g, 'steal'); applyAction(g, id, 'steal', { targetId: g.stealTargets[0] }, moves); }
      else phase(g, 'steal');
      break;
    }
    case 'steal': {
      requireThat(g.phase === 'steal' && g.stealTargets.includes(payload.targetId), 'Choose an eligible opponent.');
      const target = player(g, payload.targetId), cards = RESOURCES.flatMap(r => Array(target.resources[r]).fill(r));
      if (cards.length) { const r = cards[randomInt(cards.length)]; target.resources[r]--; p.resources[r]++; addLog(g, `${p.name} stole one resource from ${target.name}.`, 'steal'); }
      g.stealTargets = []; phase(g, g.robberReturnPhase || 'action'); break;
    }
    case 'endTurn': requireThat(g.phase === 'action', 'Finish the current decision before ending your turn.'); nextTurn(g); break;
    case 'bankTrade': {
      requireThat(g.phase === 'action', 'Trade during your action phase.');
      const { give, receive } = payload;
      requireThat(RESOURCES.includes(give), 'Choose a resource to give.');
      const received = resourceMap(typeof receive === 'string' ? { [receive]: payload.amount ?? 1 } : receive, { nonzero: true });
      const amount = sum(received);
      requireThat(!received[give], 'Choose different resources to give and receive.');
      requireThat(amount <= MAX_BANK_TRADE_CARDS, 'Choose a valid trade quantity.');
      const cost = bankTradeRate(g.board.vertices, id, give) * amount;
      pay(g, p, { [give]: cost }, moves); grant(g, p, received);
      moveResources(moves, bank, playerHand(id), received);
      const receivedText = RESOURCES.filter(r => received[r] > 0).map(r => `${received[r]} ${resourceName(r)}`).join(', ');
      addLog(g, `${p.name} exchanged ${cost} ${resourceName(give)} for ${receivedText}.`, 'trade'); break;
    }
    case 'offerTrade': {
      requireThat(playerTradesAvailable(g), 'Player trading is not available now.');
      requireThat(g.tradeOffers.length < MAX_TRADE_OFFERS, `You can have ${MAX_TRADE_OFFERS} offers open. Withdraw one to send another.`);
      const give = resourceMap(payload.give, { nonzero: true }), want = resourceMap(payload.want, { nonzero: true });
      requireThat(!RESOURCES.some(r => give[r] && want[r]), 'The same resource cannot appear on both sides of a trade.');
      requireThat(canPay(p, give), 'You do not have the offered resources.');
      g.tradeOffers.push({ id: randomUUID(), from: id, give, want, declinedBy: [] }); break;
    }
    case 'buyDevelopment': {
      requireThat(g.phase === 'action', 'Buy development cards during your action phase.');
      requireThat(g.developmentDeck.length > 0 || g.settings.unlimitedDevelopmentCards, 'The development deck is empty.');
      pay(g, p, COSTS.development, moves);
      if (!g.developmentDeck.length) g.developmentDeck = makeDevelopmentDeck(usesExpandedSupply(g.players, g.settings));
      const card = { ...g.developmentDeck.pop(), turnBought: g.turn };
      p.development.push(card);
      moves.push({ from: bank, to: playerHand(id), kind: 'development', type: card.type, cardId: card.id, count: 1 });
      addLog(g, `${p.name} bought a development card.`, 'cardDraw'); break;
    }
    case 'playDevelopment': {
      requireThat(g.phase === 'roll' || g.phase === 'action', 'Play development cards before rolling or during your action phase.');
      const card = p.development.find(c => c.id === payload.cardId);
      requireThat(card, 'That development card is not in your hand.');
      requireThat(card.type !== 'victoryPoint', 'Victory Point cards count automatically and are revealed when you win.');
      requireThat(!g.developmentPlayed, 'You may play only one development card per turn.');
      requireThat(card.turnBought < g.turn, 'You cannot play a development card on the turn you bought it.');
      const returnPhase = g.phase;
      if (card.type === 'invention') {
        const map = resourceMap(payload.resources); requireThat(sum(map) === 2, 'Choose exactly two resources.'); grant(g, p, map);
        moveResources(moves, bank, playerHand(id), map);
      } else if (card.type === 'monopoly') {
        requireThat(RESOURCES.includes(payload.resource), 'Choose a resource to monopolize.');
        let count = 0; for (const other of g.players) if (other.id !== id) { count += other.resources[payload.resource]; other.resources[payload.resource] = 0; }
        p.resources[payload.resource] += count; addLog(g, `${p.name} collected ${count} ${resourceName(payload.resource)} with Monopoly.`);
      } else if (card.type === 'roadBuilding') {
        requireThat(roadTargets(g, id).length > 0, 'You have no legal road to build.');
        g.roadBuildingRemaining = Math.min(2, p.roadsLeft); g.roadBuildingReturnPhase = returnPhase; phase(g, 'action');
      } else if (card.type === 'knight') { p.knights++; activateRobber(g, returnPhase); }
      else fail('Unknown development card.');
      p.development = p.development.filter(c => c.id !== card.id); g.playedDevelopment.push(card); g.developmentPlayed = true;
      addLog(g, `${p.name} played ${card.type === 'roadBuilding' ? 'Road Building' : card.type === 'invention' ? 'Invention' : card.type === 'knight' ? 'a Knight' : 'Monopoly'}.`, 'cardPlay'); break;
    }
    default: fail('Unknown game action.');
  }
}

// Return an isolated candidate so callers can record and commit it atomically.
export function nextGame(game, playerId, type, payload = {}) {
  // Commit only successful commands: invalid card selections/trades never partially mutate a game.
  const draft = structuredClone(game);
  if (!draft.tradeOffers) draft.tradeOffers = openTradeOffers(draft).map((offer) => ({ ...offer, declinedBy: [] }));
  delete draft.tradeOffer;
  const moves = [];
  applyAction(draft, playerId, type, payload, moves);
  enforceHandLimits(draft);
  recordDeal(draft, type, moves);
  draft.tradeOffers = draft.tradeOffers.filter((offer) => {
    const sender = player(draft, offer.from);
    return sender && canPay(sender, offer.give);
  });
  updateScores(draft); checkVictory(draft);
  return draft;
}

export function action(game, playerId, type, payload = {}) {
  const draft = nextGame(game, playerId, type, payload);
  for (const key of Object.keys(game)) delete game[key];
  Object.assign(game, draft);
  return game;
}

export function viewGame(g, playerId) {
  // Mask first: hidden hands and an unlimited deck's growing played-card history
  // should never be copied once for every connected browser and bot.
  const { developmentDeck, playedDevelopment, setupOrder, setupIndex, setupVertexId, robberReturnPhase, roadBuildingReturnPhase, primaryIndex, cardDeals, ...visible } = g;
  visible.cardDeals = viewCardDeals(cardDeals, playerId);
  visible.tradeOffers = openTradeOffers(visible).flatMap(({ declinedBy = [], ...offer }) => {
    if (offer.from === playerId) return [{ ...offer, declinedBy }];
    return declinedBy.includes(playerId) ? [] : [offer];
  });
  visible.tradeOffer = visible.tradeOffers.length === 1 ? visible.tradeOffers[0] : null;
  visible.developmentRemaining = g.settings.unlimitedDevelopmentCards ? null : developmentDeck.length;
  visible.players = visible.players.map(p => p.id === playerId || g.phase === 'finished' ? p : { ...p, resources: null, development: null, score: p.visibleScore });
  visible.legal = legal(g, playerId);
  return structuredClone(visible);
}

export function needsTick(game, now = Date.now(), excludedPlayers = []) {
  if (!game.deadline || now < game.deadline || game.phase === 'finished') return false;
  // Browser-controlled bots never receive server-selected timeout moves.
  if (game.phase === 'discard' ? !Object.keys(game.discardRequired).some(id => !excludedPlayers.includes(id)) : excludedPlayers.includes(game.activePlayerId)) return false;
  return true;
}

export function tick(game, now = Date.now(), excludedPlayers = [], onMove) {
  if (!needsTick(game, now, excludedPlayers)) return false;
  const perform = (playerId, type, payload) => {
    const previousLog = game.log.at(-1)?.seq ?? 0;
    action(game, playerId, type, payload);
    onMove?.(playerId, type, previousLog);
  };
  const id = game.activePlayerId;
  addLog(game, 'Thinking time expired; an automatic move keeps the game going.');
  if (game.phase === 'setupSettlement') {
    const targets = legal(game, id).settlements;
    const ranked = targets.map(vId => ({ id: vId, value: vertex(game, vId).hexIds.reduce((total, hId) => { const h = hex(game, hId); return total + (h.number ? 6 - Math.abs(7 - h.number) : 0); }, 0) })).sort((a, b) => b.value - a.value);
    if (ranked.length) perform(id, 'placeSettlement', { vertexId: ranked[0].id });
  } else if (game.phase === 'setupRoad') perform(id, 'placeRoad', { edgeId: legal(game, id).roads[0] });
  else if (game.phase === 'roll') { perform(id, 'rollDice'); if (game.phase === 'action') perform(id, 'endTurn'); }
  else if (game.phase === 'discard') {
    for (const [discardId, count] of Object.entries(game.discardRequired)) {
      if (excludedPlayers.includes(discardId)) continue;
      const map = emptyResources(), holdings = { ...player(game, discardId).resources };
      for (let n = 0; n < count; n++) { const r = [...RESOURCES].sort((a, b) => holdings[b] - holdings[a])[0]; map[r]++; holdings[r]--; }
      perform(discardId, 'discard', { resources: map });
    }
  } else if (game.phase === 'robber') perform(id, 'moveRobber', { hexId: legal(game, id).robberHexes[0] });
  else if (game.phase === 'steal') perform(id, 'steal', { targetId: game.stealTargets[0] });
  else if (game.phase === 'action') {
    while (game.roadBuildingRemaining && game.phase === 'action') perform(id, 'placeRoad', { edgeId: legal(game, id).roads[0] });
    if (game.phase === 'action') perform(id, 'endTurn');
    else if (game.phase === 'roll') { perform(id, 'rollDice'); if (game.phase === 'action') perform(id, 'endTurn'); }
  }
  return true;
}
